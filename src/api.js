// SmartHubClient: thin wrapper over a logged-in Playwright browser context that
// calls the same internal smarthub.amazon.in API endpoints the web app uses.
//
// Auth is handled implicitly: the persistent browser profile holds the httpOnly
// Amazon session cookies, and context.request shares that cookie jar, so every
// call here is automatically authenticated as long as the session is alive.

import { chromium } from "playwright";
import { BASE_URL, PROFILE_DIR } from "./config.js";
import { log } from "./log.js";

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
  }

  static async launch({ headless = false } = {}) {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      viewport: { width: 1366, height: 850 },
    });
    return new SmartHubClient(context);
  }

  async close() {
    await this.context.close();
  }

  _headers() {
    return {
      "Content-Type": "application/json;charset=UTF-8",
      Accept: "application/json, text/plain, */*",
      Origin: BASE_URL,
      Referer: BASE_URL + "/",
    };
  }

  // Detect a dead session: API auth failures or being bounced to an HTML login page.
  _guard(resp, where) {
    const status = resp.status();
    const ct = resp.headers()["content-type"] || "";
    if (status === 401 || status === 403) {
      throw new SessionExpiredError(`${where}: HTTP ${status} (session likely expired — run \`login\`)`);
    }
    if (ct.includes("text/html")) {
      throw new SessionExpiredError(`${where}: got HTML instead of JSON (redirected to login — run \`login\`)`);
    }
    if (!resp.ok()) {
      throw new Error(`${where}: HTTP ${status}`);
    }
  }

  async _getJson(pathname, where) {
    const resp = await this.req.get(BASE_URL + pathname, { headers: this._headers() });
    this._guard(resp, where);
    return resp.json();
  }

  async _postJson(pathname, body, where) {
    const resp = await this.req.post(BASE_URL + pathname, {
      headers: this._headers(),
      data: body,
    });
    this._guard(resp, where);
    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      return text; // some endpoints (e.g. /api/pick/list) return a bare string id
    }
  }

  // GraphQL responses come back base64-encoded JSON; decode transparently.
  async _graphql(opName, variables, where) {
    const resp = await this.req.post(BASE_URL + "/api/graphql", {
      headers: this._headers(),
      data: { operationName: opName, query: GQL[opName], variables },
    });
    this._guard(resp, where);
    const text = await resp.text();
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
  }

  // --- Session check -------------------------------------------------------

  // Returns true if the session is alive (user/details responds with JSON).
  async checkSession() {
    try {
      await this._getJson("/api/user/details", "checkSession");
      return true;
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
  async downloadBytes(url) {
    const resp = await this.context.request.get(url);
    if (!resp.ok()) throw new Error(`downloadBytes: HTTP ${resp.status()}`);
    return Buffer.from(await resp.body());
  }
}
