// SmartHubClient: thin wrapper over a logged-in Playwright browser context that
// calls the same internal smarthub.amazon.in API endpoints the web app uses.
//
// Auth is handled implicitly: the persistent browser profile holds the httpOnly
// Amazon session cookies, and context.request shares that cookie jar, so every
// call here is automatically authenticated as long as the session is alive.

import { chromium } from "playwright";
import { BASE_URL, PROFILE_DIR } from "./config.js";
import { log } from "./log.js";

// SmartHub API calls can be slow on some accounts/links (the default Playwright
// request timeout is only 30s). Use a generous timeout for all API calls.
const API_TIMEOUT = 120000;

export class SessionExpiredError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "SessionExpiredError";
  }
}

// GraphQL operations, copied verbatim from captured traffic.
const GQL = {
  PickTaskByFilters: `query PickTaskByFilters($input: PickTasksByFilterRequestInput!) { pickTasksByFilter(input: $input) { id creationEpoch expectedShipEpoch attributes { batchSize hasFastTrackOrders hasGiftMessageOrders hasGiftOrders hasGiftWrapOrders hasHazmatOrders hasSidelineOrders hasSingleOrders hasTemperatureRatedOrders numberOfOrders salesChannelWithAttributesList { isSelfShip salesChannel displayableSalesChannel } } } }`,
  RetrieveBatchOrderDocuments: `query RetrieveBatchOrderDocuments($input: RetrieveBatchDocumentsInput!) { orderDocuments(input: $input) { result { ... on CombinedRetrieveBatchDocumentsResponse { fileGenerationPreference ordersIncluded fileDetails { url urlType } } } errors { errorMessage orderId } fileFormat requestedDocumentTypes } }`,
};

export class SmartHubClient {
  constructor(context) {
    this.context = context;
    this.req = context.request;
    this.page = null; // persistent authenticated page used for all API calls
  }

  // NOTE: we ALWAYS launch headed — Amazon's SSO auto-redirect (the openid bounce
  // back to smarthub) stalls in headless mode, leaving the session unusable.
  // For unattended runs we launch headed but position the window far off-screen
  // so it's invisible. `visible:true` (for `login`) shows a real on-screen window.
  static async launch({ visible = false } = {}) {
    const args = visible ? [] : ["--window-position=-32000,-32000", "--window-size=1280,800"];
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      args,
      viewport: { width: 1366, height: 850 },
    });
    return new SmartHubClient(context);
  }

  async close() {
    await this.context.close();
  }

  // Ensure a page exists and is on the smarthub origin so same-origin fetch is
  // authenticated with the live session (httpOnly cookies included).
  async _ensurePage() {
    if (!this.page || this.page.isClosed()) {
      this.page = await this.context.newPage();
    }
    if (!/smarthub\.amazon\.in/i.test(this.page.url())) {
      await this.page.goto(BASE_URL + "/dashboard", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await this.page.waitForURL(/smarthub\.amazon\.in/, { timeout: 25000 }).catch(() => {});
    }
    return this.page;
  }

  // Make an API call from INSIDE the authenticated page (same-origin fetch).
  // This is exactly how the real web app calls its API, so it uses the page's
  // live session — avoiding the cookie-sync gap that context.request can hit.
  async _pageRequest(method, pathname, body, timeout = API_TIMEOUT) {
    const page = await this._ensurePage();
    return page.evaluate(
      async ({ method, url, body, timeout }) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        try {
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json;charset=UTF-8", Accept: "application/json, text/plain, */*" },
            body: body != null ? JSON.stringify(body) : undefined,
            credentials: "include",
            signal: ctrl.signal,
          });
          const text = await res.text();
          return { status: res.status, ct: res.headers.get("content-type") || "", text };
        } catch (e) {
          return { status: 0, ct: "", text: "", error: String(e) };
        } finally {
          clearTimeout(t);
        }
      },
      { method, url: BASE_URL + pathname, body: body ?? null, timeout }
    );
  }

  // Detect a dead session from a page-fetch result.
  _guardResult(r, where) {
    if (r.error) throw new Error(`${where}: ${r.error}`);
    if (r.status === 401 || r.status === 403) {
      throw new SessionExpiredError(`${where}: HTTP ${r.status} (session likely expired — run \`login\`)`);
    }
    if ((r.ct || "").includes("text/html")) {
      throw new SessionExpiredError(`${where}: got HTML instead of JSON (redirected to login — run \`login\`)`);
    }
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`${where}: HTTP ${r.status}`);
    }
  }

  // Run a request; if it looks session-expired (HTML/401), refresh the rotating
  // Amazon tokens via a page navigation and retry ONCE. Only a genuinely dead
  // session (refresh still lands on a login form) surfaces as SessionExpiredError.
  async _withAuthRetry(fn) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof SessionExpiredError)) throw e;
      const ok = await this.warmup();
      if (!ok) throw e; // truly logged out
      return await fn(); // tokens refreshed — retry once
    }
  }

  async _getJson(pathname, where) {
    return this._withAuthRetry(async () => {
      const r = await this._pageRequest("GET", pathname, null);
      this._guardResult(r, where);
      return JSON.parse(r.text);
    });
  }

  async _postJson(pathname, body, where) {
    return this._withAuthRetry(async () => {
      const r = await this._pageRequest("POST", pathname, body);
      this._guardResult(r, where);
      try {
        return JSON.parse(r.text);
      } catch {
        return r.text; // some endpoints (e.g. /api/pick/list) return a bare string id
      }
    });
  }

  // GraphQL responses come back base64-encoded JSON; decode transparently.
  async _graphql(opName, variables, where) {
    return this._withAuthRetry(async () => {
      const r = await this._pageRequest("POST", "/api/graphql", { operationName: opName, query: GQL[opName], variables });
      this._guardResult(r, where);
      const text = r.text;
      let json;
      if (/^[A-Za-z0-9+/=\r\n]+$/.test(text.trim())) {
        try {
          json = JSON.parse(Buffer.from(text, "base64").toString("utf8"));
        } catch {
          json = JSON.parse(text);
        }
      } else {
        json = JSON.parse(text);
      }
      if (json.errors && json.errors.length) {
        throw new Error(`${where}: GraphQL error ${JSON.stringify(json.errors).slice(0, 300)}`);
      }
      return json.data;
    });
  }

  // --- Session check -------------------------------------------------------

  // Warm up the session: navigate to the app so Amazon can refresh its rotating
  // auth tokens (at-acbin / sess-at-acbin). A cold API call can 401 with a merely
  // *stale* (but refreshable) token; loading a page triggers the refresh redirects
  // and writes fresh cookies back to the persistent profile.
  // Returns true if logged in, false if redirected to a sign-in page.
  async warmup() {
    if (!this.page || this.page.isClosed()) this.page = await this.context.newPage();

    // Force a fresh navigation so Amazon's SSO refreshes the rotating tokens on
    // the page session that our API fetches use.
    await this.page.goto(BASE_URL + "/dashboard", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    // The URL bounces through amazon.in/ap/signin and AUTO-redirects back to
    // smarthub when the parent Amazon session is valid (no OTP). Wait generously.
    await this.page.waitForURL(/smarthub\.amazon\.in/, { timeout: 25000 }).catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

    const url = this.page.url();
    if (/smarthub\.amazon\.in/i.test(url)) return true; // settled on smarthub -> logged in

    // Not on smarthub: logged out only if an actual Amazon credential field is
    // shown (email or password). Otherwise assume a transient redirect (fine).
    const hasLoginForm = await this.page
      .locator('#ap_password, #ap_email, input[type="password"]')
      .count()
      .catch(() => 0);
    return !hasLoginForm;
  }

  // Returns true if the session is alive. Decided purely from the page (whether
  // the dashboard loads vs a login form), which is reliable; the actual API calls
  // self-heal any stale rotating token via _withAuthRetry, so no flaky cold API
  // check here.
  async checkSession() {
    try {
      return await this.warmup();
    } catch (e) {
      if (e instanceof SessionExpiredError) return false;
      throw e;
    }
  }

  // --- Pick task discovery -------------------------------------------------

  // Find activated pick tasks for a date (YYYY-MM-DD) that include the channel.
  async findPickTasks(dateStr, salesChannel) {
    const out = [];
    for (const status of ["ACTIVE", "COMPLETED"]) {
      const data = await this._graphql(
        "PickTaskByFilters",
        { input: { startExSD: dateStr, endExSD: dateStr, pickTaskType: "CUSTOMER", status } },
        `PickTaskByFilters(${status})`
      );
      const tasks = data?.pickTasksByFilter || [];
      for (const t of tasks) {
        const channels = (t.attributes?.salesChannelWithAttributesList || []).map((s) => s.salesChannel);
        if (channels.includes(salesChannel)) out.push({ ...t, status });
      }
    }
    return out;
  }

  // Order counts for a channel on a date (total / packed / waiting etc.).
  async getOrdersSummary(dateStr, salesChannel, isSelfShip = false) {
    const qs = `date=${dateStr}&salesChannelFilters[0].salesChannel=${encodeURIComponent(salesChannel)}&salesChannelFilters[0].isSelfShip=${isSelfShip}`;
    const arr = await this._getJson(`/api/orders/summary?${qs}`, "getOrdersSummary");
    return Array.isArray(arr) ? arr[0] || null : arr;
  }

  // Validate a pick task -> returns the shipments it contains.
  async validatePickTask(pickTaskId) {
    return this._getJson(
      `/api/pick/picktaskid/validate?pickTaskId=${encodeURIComponent(pickTaskId)}`,
      "validatePickTask"
    );
  }

  // --- Pick-list activation (auto-activate) --------------------------------

  // Recommended CPT (critical-pull-time) windows; each has newOrders/totalOrders.
  async getRecommendedCpts() {
    return this._getJson("/api/pick/cpts/recommended", "getRecommendedCpts");
  }

  // Recommended pick-list cards for the given pickup-time windows (epoch seconds).
  // Each card: { expectedShipEpoch, numberOfOrders, pickTaskNotGenerated,
  //              displayableSalesChannel: { salesChannel, isSelfShip } }
  async getRecommendedLists(pickupTimes) {
    const qs = pickupTimes.map((t, i) => `pickupTimes[${i}]=${t}`).join("&");
    return this._getJson(
      `/api/pick/lists/recommended?${qs}&createPickListCardType=UPCOMING`,
      "getRecommendedLists"
    );
  }

  // Create (activate) a pick list. Returns the new pick task id (a bare string).
  async createPickList({ expectedShipEpoch, numberOfOrders, salesChannel, isSelfShip = false }) {
    return this._postJson(
      "/api/pick/list",
      {
        startExSD: expectedShipEpoch,
        endExSD: expectedShipEpoch,
        isSingle: null,
        isGift: null,
        isFastTrack: null,
        isSerialNumRequired: null,
        batchSize: numberOfOrders,
        salesChannelFilterList: [{ salesChannel, isSelfShip }],
        includeOnlyInRecommendedSlots: true,
        isReturnAuthenticityTagRequired: null,
      },
      "createPickList"
    );
  }

  // --- Pack / ship ---------------------------------------------------------

  async createPackages(packageDetailsList) {
    return this._postJson("/api/bulk-pack/packages", { packageDetailsList }, "createPackages");
  }

  async listPickupSlots(customerShipmentIds) {
    return this._postJson("/api/bulk-pack/list-pickup-slots", { customerShipmentIds }, "listPickupSlots");
  }

  // Map each customerShipmentId -> its recommended pickup slotId (first package).
  // Returns {} if none. Needed because Amazon MFN requires pickupSlotId on the
  // generate-shiplabel call.
  static recommendedSlotMap(slotsResp) {
    const out = {};
    const map = slotsResp?.shipmentIdToPickupSlotsByPackageListMap || {};
    for (const csid of Object.keys(map)) {
      const pkgs = map[csid] || [];
      const first = pkgs[0] || {};
      const slot = first.recommendedPickupSlot || (first.pickupSlotsList || [])[0];
      if (slot && slot.slotId) out[csid] = slot.slotId;
    }
    return out;
  }

  async generateInvoices(customerShipmentIdList) {
    return this._postJson("/api/bulk-pack/generate-invoices", { customerShipmentIdList }, "generateInvoices");
  }

  async generateShipLabel(shipLabelRequests) {
    return this._postJson("/api/bulk-pack/generate-shiplabel", { shipLabelRequests }, "generateShipLabel");
  }

  // Retrieve a single combined SHIP_LABEL PDF for a set of shipments.
  // Returns the presigned S3 URL of the combined PDF.
  async retrieveCombinedLabelUrl(customerShipmentIds, marketplace) {
    const data = await this._graphql(
      "RetrieveBatchOrderDocuments",
      {
        input: {
          orderIds: customerShipmentIds,
          marketplace,
          requiredDocumentTypes: ["SHIP_LABEL"],
          preferences: { fileFormat: "PDF", fileGenerationPreference: "COMBINED" },
        },
      },
      "RetrieveBatchOrderDocuments"
    );
    const result = data?.orderDocuments?.result;
    const errors = data?.orderDocuments?.errors || [];
    if (errors.length) log.warn("Some documents failed:", JSON.stringify(errors).slice(0, 300));
    const url = result?.fileDetails?.url;
    if (!url) throw new Error("retrieveCombinedLabelUrl: no file URL returned");
    return { url, ordersIncluded: result.ordersIncluded || [] };
  }

  // Download a (presigned S3) URL and return its bytes. No auth headers — the
  // URL is already signed; sending our smarthub headers can break the S3 request.
  // Generous timeout: combined label PDFs can be several MB over a slow link.
  async downloadBytes(url) {
    const resp = await this.context.request.get(url, { timeout: 180000 });
    if (!resp.ok()) throw new Error(`downloadBytes: HTTP ${resp.status()}`);
    return Buffer.from(await resp.body());
  }
}
