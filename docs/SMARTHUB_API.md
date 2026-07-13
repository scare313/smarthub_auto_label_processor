# SmartHub Internal API — Reference

> Reverse-engineered from captured browser traffic (HAR) of **smarthub.amazon.in**.
> Schemas show **field names + types** (customer PII omitted; values shown only for
> enum-like fields; ID-keyed maps collapsed to one `<id>` sample). Living document.

## Conventions
- **Base URL:** `https://smarthub.amazon.in`
- **Auth:** Amazon SSO session cookies (httpOnly, same-origin). No bearer/CSRF header.
- **Content-Type:** `application/json;charset=UTF-8` for POST bodies.
- **GraphQL:** single endpoint `POST /api/graphql`; **responses are base64-encoded JSON**.
- **Timestamps:** epoch **seconds** unless noted (some slot fields use ms).
- **salesChannel:** `MFN` (Amazon Easy Ship), `FKSTANDARD` (Flipkart), `MEESHO`, `FBA`. `marketplace`: `AMAZON`, `FLIPKART`, `MEESHO`.

---

## REST Endpoints

### Session & User

#### `GET /api/access/features`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "ENABLE_CRITICAL_FUNCTIONS_ONLY_MODE": "null",
  "ENABLE_BATCH_LOT_PROVENENCE_AT_STOW": "null",
  "ENABLE_EXSD_MULTISELECT": "boolean",
  "IS_RETURN_AUTHENTICITY_TAG_ENABLED": "null",
  "DISABLE_REPORT_DOWNLOAD": "null",
  "DISABLE_MINERVA_CHATBOT": "boolean",
  "ENABLE_EFP_INVENTORY_API_INTEGRATION": "null",
  "ENABLE_MRP_PROVENENCE_AT_STOW": "null",
  "IS_BULK_INVOICE_AND_SHIP_LABEL_GENERATION_ENABLED": "null",
  "IS_PACK_EXPERIENCE_FOR_PHARMACY_ITEMS_ENABLED": "null",
  "IS_HARD_DIMENSION_CHECK_ENABLED": "null",
  "ENABLE_INBOUND_TRANS_SHIPMENT": "null",
  "ENABLE_ONLY_QUICK_INBOUND": "null",
  "IS_SHIPMENT_CANCELLATION_ALLOWED_TILL_SLAM": "null",
  "ENABLE_TCAPS_THROTTLING": "boolean",
  "USE_PERFORMANCE_AUTOMATION_FRAMEWORK_V2": "null",
  "ENABLE_AUTO_SHIP": "boolean",
  "ENABLE_FLEX_COMBO": "null",
  "IS_OVERAGE_ALLOWED": "boolean",
  "ENABLE_REMOVAL_UI": "boolean",
  "IS_MOBILE_APP_EXPERIENCE_ENABLED": "null",
  "ENABLE_AUTO_SHIP$||@#SHOPIFY": "boolean",
  "ENABLE_AUTO_SHIP$||@#MYNTRA_PPMP": "boolean",
  "ENABLE_AUTO_MERCHANT_SELECTION_FOR_INVENTORY_ADJUSTMENT": "null",
  "ALLOW_BIN_COMMINGLING": "null",
  "ENABLE_BULK_INBOUNDING": "null",
  "IS_MPS_ENABLED": "null",
  "ENABLE_RENEWED_PRODUCT_VALIDATIONS": "null",
  "DISABLE_FUTURE_EXSD_PICK_LIST_GENERATION": "null",
  "IS_ML_RECOMMENDED_DIMENSIONS_ENABLED": "null",
  "MERCHANT_FUNGIBILITY_ALLOWED": "boolean",
  "ENABLE_PRE_INBOUND_INVOICE_UPLOAD": "null",
  "IS_MERCHANT_ID_DISPLAY_ALLOWED": "null",
  "IS_PLASTIC_PACKAGING_DISALLOWED": "null",
  "ENABLE_AUTO_SHIP$||@#FKSTANDARD": "boolean",
  "IS_CYCLE_COUNT_BULK_UPLOAD_ENABLED": "null",
  "ENABLE_TEMPERATURE_CONTROLLED_PRODUCT": "null",
  "IS_BULK_PACK_ENABLED": "null",
  "IS_PERFORMANCE_MANAGEMENT_AUTOMATED": "boolean",
  "ENABLE_SHIPMENT_CANCELLATION_BY_CUSTOMER_ABUSE_INVESTIGATION": "null",
  "ENABLE_BULK_SHIPMENT_PACKING": "null",
  "ENABLE_SCAN_AND_STOW": "boolean",
  "IS_CONFIRM_PACK_ENABLED": "null",
  "ENABLE_PACKING_SLIP_WITH_DNC": "null"
}
```

#### `GET /api/access/operations`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "ViewInventoryBySku": "boolean",
  "UpdatePrinterSettingsPage": "boolean",
  "ViewHelpPageSmarthub": "boolean",
  "UpdateLayoutManagementPage": "boolean",
  "ViewReturnsDashboardV2": "boolean",
  "ViewRemovalPickListPage": "boolean",
  "RecordSellerAcceptance": "boolean",
  "ViewPrinterSettingsPage": "boolean",
  "SafetEdit": "boolean",
  "SidelineCustomerShipment": "boolean",
  "SafetView": "boolean",
  "ReceiveAndStoreInventory": "boolean",
  "AddBox": "boolean",
  "DeleteBox": "boolean",
  "SavePickListSettings": "boolean",
  "DefaultOperation": "boolean",
  "AllowBulkInbound": "boolean",
  "ViewShipPage": "boolean",
  "PackCustomerShipment": "boolean",
  "DeleteRole": "boolean",
  "ViewAdjustInventoryPage": "boolean",
  "AdjustInventory": "boolean",
  "ViewReturnsPage": "boolean",
  "ViewCancelOrder": "boolean",
  "ViewMyOrdersPage": "boolean",
  "ViewPurchaseOrderDetails": "boolean",
  "ViewPerformanceBanner": "boolean",
  "AddBoxes": "boolean",
  "AddUser": "boolean",
  "EditLocationDetailsPage": "boolean",
  "CreatePickTask": "boolean",
  "GetPickListSettings": "boolean",
  "ViewNeedActionInventory": "boolean",
  "ViewInventoryByBin": "boolean",
  "CancelShipment": "boolean",
  "CreateRemovalPickList": "boolean",
  "CancelInvite": "boolean",
  "StoreInventory": "boolean",
  "GenerateReturnsReconciliationReport": "boolean",
  "GetRemovalPickTaskDetails": "boolean",
  "GenerateReturnOTPReport": "boolean",
  "PrintPickTask": "boolean",
  "ViewStorePage": "boolean",
  "GenerateInventoryReport": "boolean",
  "ViewPickList": "boolean",
  "ViewUserManagementPage": "boolean",
  "ViewReceiveAndStorePage": "boolean",
  "UpdateBoxConfigurationPage": "boolean",
  "ViewDownloadPage": "boolean",
  "DownloadReport": "boolean"
}
```

#### `GET /api/access/weblabs`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "SH_DECOUPLE_DOWNLOADS_PAGE_1375961": "boolean",
  "ONSITE_WMS_MIGRATE_AUDIT_PAGE_585501": "boolean",
  "ONSITE_WMS_MIGRATE_POD_HANDOVER_992473": "boolean",
  "SH_INVENTORY_AUDIT_ACCOUNT_MARKETPLACE_FILTER_1413732": "boolean",
  "SH_DECOUPLE_LAYOUT_PACK_1420612": "boolean",
  "SH_DECOUPLE_HOLIDAYS_PAGE_1384834": "boolean",
  "ONSITE_WMS_BULK_PACKING_NEW_355846": "boolean",
  "ONSITE_WMS_RETURNS_SUMMARY_484429": "boolean",
  "SH_CATALOG_DASHBOARD_1353325": "boolean",
  "SF_DECOUPLE_LAYOUT_HOLIDAYS_1371041": "boolean",
  "SH_PROJECT_WARP_WMS_1366455": "boolean",
  "SC_ALLOW_FRAGILE_ATTRIBUTE_PER_PACKAGE_913408": "boolean",
  "YOJAKA_INVENTORY_UNMANAGED_MODE_1397814": "boolean",
  "SH_MANAGE_CATALOG_ACCOUNT_MARKETPLACE_FILTER_1413725": "boolean",
  "ONSITE_WMS_LOCALE_BASED_PRODUCT_TITLE_565648": "boolean",
  "SHIP_LABEL_PDF_PRINT_780772": "boolean",
  "SF_DECOUPLE_LAYOUT_ONBOARDING_1419773": "boolean",
  "SH_BULK_PACK_BULK_EDIT_EASYSHIP_PICKUP_SLOT_1394628": "boolean",
  "SF_DECOUPLE_LAYOUTS_PAGE_1411515": "boolean",
  "SF_DECOUPLE_UI_PICK_1374252": "boolean",
  "SIMPLE_BIN_COUNT_355845": "boolean",
  "ONE_CROSS_INVENTORY_UPDATE_SMARTHUB_OMS_1159251": "boolean",
  "SH_LOW_INVENTORY_1353703": "boolean",
  "SH_ORDER_SUMMARY_ACCOUNT_MARKETPLACE_FILTER_1411601": "boolean",
  "ONSITE_WMS_HAZMAT_775387": "boolean",
  "SAFET_ENABLED_ON_WAREHOUSE_TYPE_771963": "boolean",
  "SF_DECOUPLE_LAYOUT_PICK_1304615": "boolean",
  "SELLERFLEX_GEN_AI_Q_AND_A_1339173": "boolean",
  "LPS_DARU_NAWS_MIGRATION_AWUI_1375960": "boolean",
  "ONSITE_WMS_MIGRATE_ACCESS_MANAGEMENT_NEW_356028": "boolean",
  "SF_DECOUPLE_LAYOUT_PD_1320435": "boolean",
  "RAPID_HANDOVER_MIGRATION_1101861": "boolean",
  "ONSITE_WMS_MIGRATE_VIEW_ALL_TRANSFERS_NEW_356020": "boolean",
  "LARDER_CATALOG_REQUESTS_NEW_364426": "boolean",
  "SH_PROJECT_WARP_OMS_1366454": "boolean",
  "ONSITE_WMS_MIGRATE_SHIP_NEW_352804": "boolean",
  "SH_PRINT_PICKLIST_1252698": "boolean",
  "SH_CONTACT_US_PAGE_1286992": "boolean",
  "SH_PRINT_DOWNLOAD_DECOUPLING_1373645": "boolean",
  "SH_ANALYTICS_TAB_1353691": "boolean",
  "SMART_HUB_DASHBOARD_1353701": "boolean",
  "ONSITE_WMS_MIGRATE_CANCEL_ORDER_NEW_902500": "boolean",
  "ONSITE_WMS_LOS_TRAFFIC_SHIFTING_NAWS_918809": "boolean",
  "SH_ALL_ORDERS_ACCOUNT_MARKETPLACE_FILTER_1413091": "boolean",
  "SF_DECOUPLE_LAYOUT_INBOUND_1400141": "boolean",
  "SF_DECOUPLE_LAYOUT_PRINTER_1409510": "boolean",
  "SH_BULK_PACK_ACCOUNT_MARKETPLACE_FILTER_1413733": "boolean",
  "SF_VIEW_ON_AMAZON_FIX_1420001": "boolean",
  "ONSITE_WMS_MIGRATE_HELP_PAGE_NEW_352802": "boolean",
  "SF_DECOUPLE_LAYOUT_USER_MANAGEMENT_1412372": "boolean"
}
```

#### `GET /api/help/list`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
[
  {
    "displayName": "string",
    "legoPath": "string",
    "subPages": [],
    "pagePath": "string"
  }
]
```

#### `GET /api/performance/status`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "<id>": "boolean"
}
```

#### `GET /api/user/details`
- Source: `1amazon_easy_ship.har` · status 200
- Query: `?isV2=true`

**Response**
```json
{
  "<id>": {
    "selectedDropdownItem": "string",
    "dropdownItems": [
      {
        "id": "string",
        "value": "string"
      }
    ]
  }
}
```

#### `POST /api/translations`
- Source: `1amazon_easy_ship.har` · status 200

**Request body**
```json
[
  "string"
]
```

**Response**
```json
{
  "LARDER_APP_PRINTER_SETTINGS_MANUAL_PRINT_MODE_DESCRIPTION": "string",
  "LARDER_APP_BULK_JOB_TABLE_STATUS_CREATED": "string",
  "LARDER_APP_SKU_DETAILS_MODAL_BRAND": "string",
  "LARDER_APP_PICK_LIST_DETAILS_RESUME_PACKING": "string",
  "LARDER_APP_SF_PACK_SINGLE_ORDER": "string",
  "LARDER_APP_EXECUTE_CYCLE_COUNT_UNAVAILABLE_CONTAINER_ERROR_MESSAGE": "string",
  "LARDER_APP_USER_MANAGEMENT_NEW_USER_LOCATION_DETAILS_DESCRIPTION": "string",
  "LARDER_APP_WHAT_IS_SPOO_LABEL_LINK": "string",
  "LARDER_APP_INVENTORY_AUDIT_TITLE": "string",
  "LARDER_APP_EDIT_CATALOG_IDENTIFIER_TYPE_ISBN": "string",
  "LARDER_APP_PACK_PRINT_GIFT_MESSAGE_ERROR_MESSAGE": "string",
  "LARDER_APP_ITEM_ID": "string",
  "LARDER_APP_POD_WAREHOUSE_SEAL": "string",
  "LARDER_APP_PICK_MULTI_CPT_COUNT_FOR_DATE": "string",
  "LARDER_APP_ROLE_CONFIGURATIONS_NO_ROLE_SELECTED_ERROR": "string",
  "LARDER_APP_LAYOUT_ADD_YOUR_WAREHOUSE_ALERT_FILE_UPLOADED": "string",
  "LARDER_APP_PRINTER_ALERT_SCAN": "string",
  "LARDER_APP_SALES_CHANNEL_VAS_SELF_SHIP": "string",
  "LARDER_APP_EXECUTE_CYCLE_COUNT_TASK_STATUS_COMPLETED": "string",
  "LARDER_APP_LOCATIONS_LOCATION_ADDRESS": "string",
  "LARDER_APP_PACK_REPRINT_GIFT_CARD_LINK_TEXT": "string",
  "LARDER_APP_EXECUTE_CYCLE_COUNT_SCAN_SKU_BIN_LEVEL_LABEL": "string",
  "LARDER_APP_INVENTORY_AUDIT_PO": "string",
  "LARDER_APP_LABEL_ALL_COMPANIES": "string",
  "LARDER_APP_VIEW_LOCATION": "string",
  "LARDER_APP_INVENTORY_EXPIRY_DATE_LABEL": "string",
  "LARDER_APP_PERFORMANCE_PRIME_BADGE_DEACTIVATE_ALERT": "string",
  "LARDER_APP_PICK_LIST_DETAILS_UNITS_LABEL": "string",
  "LARDER_APP_ORDERS_DASHBOARD_LABEL_TOTAL": "string",
  "LARDER_APP_ORDER_DETAILS_EXPECTED_DELIVERY_LABEL": "string",
  "LARDER_APP_PERFORMANCE_STRIKE_COUNT": "string",
  "LARDER_APP_ERROR_RESTRICTED_CATEGORY": "string",
  "LARDER_APP_USER_MANAGEMENT_PERSONAL_DETAILS_TITLE": "string",
  "LARDER_APP_ROLE_CONFIGURATIONS_MANAGE_ROLE_DESCRIPTION": "string",
  "LARDER_APP_MY_ORDERS_ORIGINAL_SKU": "string",
  "LARDER_APP_ADJUST_SELLERFLEX_DOWNLOAD_APP_TEXT": "string",
  "LARDER_APP_PICK_TASK_FILTER_NON_PRIME_ORDER": "string",
  "LARDER_APP_PICK_LIST_DETAILS_HERE_TEXT": "string",
  "LARDER_APP_CYCLE_COUNT_BULK_UPLOAD_MODAL_STEP_1_SKU_BUTTON": "string",
  "LARDER_APP_LABEL_OPERATION_STATUS": "string",
  "LARDER_APP_PICK_LIST_CREATION_DISABLED_FOR_ALL_MESSAGE": "string",
  "LARDER_APP_CYCLE_COUNT_ISSUE_TABLE_EXPECTED_QUANTITY_HEADER": "string",
  "LARDER_APP_MANAGE_CATALOG_TABLE_MEESHO_HEADING": "string",
  "LARDER_APP_PICK_TASK_FILTER_SINGLE_ORDER": "string",
  "LARDER_APP_RETURNS_RECONCILIATION_TRACKING_INFORMATION_MODAL": "string",
  "LARDER_APP_ROLE_CONFIGURATION_DESCRIPTION_TEXT": "string",
  "LARDER_APP_CONFIRM_ORDER_ASIN_TABLE_HSN_TOOLTIP": "string",
  "LARDER_APP_OKAY_TEXT": "string",
  "LARDER_APP_HOLIDAY_MANAGEMENT_TABLE_END_DATE_LABEL": "string",
  "LARDER_APP_TRANSSHIPMENT_TOTAL_UNITS_RECEIVED": "string"
}
```

### Warehouse

#### `GET /api/warehouse/details`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "<id>": "string"
}
```

#### `GET /api/warehouse/notifications/banner`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "notificationId": "string",
  "startEpochInMillis": "number",
  "endEpochInMillis": "number",
  "title": "string",
  "description": "string",
  "redirectUrl": "null",
  "redirectUrlText": "null",
  "isClosable": "boolean",
  "page": "string",
  "severity": "string",
  "creationEpochInMillis": "number",
  "lastUpdatedEpochInMillis": "number",
  "type": "string",
  "warehouseIdListStorage": "null",
  "warehouseIdListFilePath": "null",
  "renderParams": {
    "date": "string",
    "metricType": "string",
    "backlog": "string",
    "warehouseId": "string",
    "cpt": "string",
    "startTime": "string",
    "breachValue": "string"
  }
}
```

### Pick

#### `GET /api/pick/cpts/recommended`
- Source: `1amazon_easy_ship_missed.har` · status 200

**Response**
```json
[
  {
    "<id>": "number"
  }
]
```

#### `GET /api/pick/lists/missed`
- Source: `1amazon_easy_ship_missed.har` · status 200

**Response**
```json
[
  {
    "status": "enum:\"NEW\"",
    "creationEpoch": "null",
    "pickTool": "enum:\"PAPER\"",
    "id": "null",
    "expectedShipEpoch": "number",
    "pickTaskType": "enum:\"CUSTOMER\"",
    "hasFastTrackOrders": "null",
    "hasGiftOrders": "null",
    "hasHazmatOrders": "null",
    "hasSingleOrders": "null",
    "hasPrimeOrders": "null",
    "hasSerialNumRequiredOrders": "null",
    "hasReturnAuthenticityTagRequiredOrders": "null",
    "isDisabled": "boolean",
    "numberOfOrders": "number",
    "readableCreationDate": "null",
    "pickTaskNotGenerated": "boolean",
    "displayableSalesChannel": {
      "<id>": "string"
    }
  }
]
```

#### `GET /api/pick/lists/recommended`
- Source: `complete.har` · status 200
- Query: `?pickupTimes[0]=1781937000&pickupTimes[1]=1781980199&createPickListCardType=UPCOMING`

**Response**
```json
[
  {
    "status": "enum:\"NEW\"",
    "creationEpoch": "null",
    "pickTool": "enum:\"PAPER\"",
    "id": "null",
    "expectedShipEpoch": "number",
    "pickTaskType": "enum:\"CUSTOMER\"",
    "hasFastTrackOrders": "null",
    "hasGiftOrders": "null",
    "hasHazmatOrders": "null",
    "hasSingleOrders": "null",
    "hasPrimeOrders": "null",
    "hasSerialNumRequiredOrders": "null",
    "hasReturnAuthenticityTagRequiredOrders": "null",
    "isDisabled": "boolean",
    "numberOfOrders": "number",
    "readableCreationDate": "null",
    "pickTaskNotGenerated": "boolean",
    "displayableSalesChannel": {
      "<id>": "string"
    }
  }
]
```

#### `GET /api/pick/orders/missed/count`
- Source: `1amazon_easy_ship_missed.har` · status 200

**Response**
```json
"number"
```

#### `GET /api/pick/picktaskid/validate`
- Source: `1amazon_easy_ship.har` · status 200
- Query: `?pickTaskId=P1781869748616388`

**Response**
```json
{
  "<id>": "number"
}
```

#### `GET /api/pick/throttling-status`
- Source: `1amazon_easy_ship_missed.har` · status 200

**Response**
_(not captured)_

#### `POST /api/pick/list`
- Source: `1amazon_easy_ship_missed.har` · status 200

**Request body**
```json
{
  "startExSD": "number",
  "endExSD": "number",
  "isGift": "null",
  "isFastTrack": "null",
  "isSerialNumRequired": "null",
  "batchSize": "number",
  "salesChannelFilterList": [
    {
      "salesChannel": "enum:\"MFN\"",
      "isSelfShip": "boolean"
    }
  ],
  "isReturnAuthenticityTagRequired": "null"
}
```

**Response**
_(not captured)_

### Pack (config)

#### `GET /api/pack/boxes`
- Source: `1amazon_easy_ship.har` · status 200

**Response**
```json
{
  "<id>": "null"
}
```

#### `GET /api/pack/sideline-reasons`
- Source: `smarthub.amazon.in.har` · status 200

**Response**
```json
{
  "sidelineReasons": [
    {
      "<id>": "string"
    }
  ]
}
```

### Bulk-Pack (packing & shipping)

#### `POST /api/bulk-pack/generate-invoices`
- Source: `1amazon_easy_ship.har` · status 200

**Request body**
```json
{
  "customerShipmentIdList": [
    "string"
  ]
}
```

**Response**
```json
{
  "shipmentIdToInvoiceDetailsMap": {
    "DKTzST1qJ": {
      "<id>": {
        "<id>": "string"
      }
    }
  },
  "shipmentIdToErrorMap": {}
}
```

#### `POST /api/bulk-pack/generate-shiplabel`
- Source: `1amazon_easy_ship.har` · status 200

**Request body**
```json
{
  "shipLabelRequests": [
    {
      "<id>": "string"
    }
  ]
}
```

**Response**
```json
{
  "shipmentIdToPackageTrackingInfoListMap": {
    "DKTzST1qJ": [
      {
        "<id>": "string"
      }
    ]
  },
  "shipmentIdToErrorMap": {}
}
```

#### `POST /api/bulk-pack/list-pickup-slots`
- Source: `1amazon_easy_ship.har` · status 200

**Request body**
```json
{
  "customerShipmentIds": [
    "string"
  ]
}
```

**Response**
```json
{
  "shipmentIdToPickupSlotsByPackageListMap": {
    "DKTzST1qJ": [
      {
        "<id>": "string"
      }
    ]
  },
  "shipmentIdToErrorMap": {}
}
```

#### `POST /api/bulk-pack/packages`
- Source: `1amazon_easy_ship.har` · status 200

**Request body**
```json
{
  "packageDetailsList": [
    {
      "customerShipmentId": "string",
      "length": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\""
      },
      "width": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\""
      },
      "height": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\""
      },
      "weight": {
        "measure": "number",
        "unitOfMeasure": "enum:\"KG\""
      },
      "boxName": "enum:\"RecommendedPackage\"",
      "hazmatLabels": [],
      "fragile": "boolean"
    }
  ]
}
```

**Response**
```json
{
  "shipmentIdToErrorMap": {}
}
```

### Orders

#### `GET /api/orders/details`
- Source: `Cancelled_AMZ.har` · status 200
- Query: `?exSD=1783967399&exclusiveStartRecordNumber=0&shipmentStatus=CANCELLED`

**Response**
```json
[
  {
    "<id>": "string"
  }
]
```

#### `GET /api/orders/summary`
- Source: `1amazon_easy_ship.har` · status 200
- Query: `?date=2026-06-20&salesChannelFilters[0].salesChannel=MFN&salesChannelFilters[0].isSelfShip=false`

**Response**
```json
[
  {
    "<id>": "number"
  }
]
```

### Inventory & Catalog

#### `GET /api/inbound/product-details`
- Source: `Inventory_Update.har` · status 200
- Query: `?scanned-id=CAP-RAIN-BASEBALL-BLACK`

**Response**
```json
{
  "<id>": "string"
}
```

#### `GET /api/manage-catalog/items/{id}`
- Source: `Inventory_Update.har` · status 200
- Query: `?relationship-type=BUNDLE&query=query getCatalogItemQuery {  getCatalogItemById(id:"{id}", dataEnrichmentAttributes: {listings:ALL relationships:ID_ONLY}) {responseType catalogItem{id catalogOwnerId customId status identifiers{type value} attributes{title description imageURLs isBestSeller measureme`

**Response**
```json
{
  "<id>": {
    "id": "string",
    "catalogOwnerId": "string",
    "customId": "string",
    "sizeGuide": "null",
    "status": "enum:\"ACTIVE\"",
    "identifiers": [],
    "attributes": {
      "<id>": "string"
    },
    "category": {
      "id": "string",
      "name": "string"
    },
    "categoryAttributes": "string",
    "listings": [
      {
        "id": "string",
        "marketplaceRegionChannel": "string",
        "marketplaceRegionChannelCatalogItemId": "string",
        "status": "enum:\"ACTIVE\"",
        "companyId": "null"
      }
    ],
    "relationships": [],
    "relationshipItems": "null",
    "creationTimestamp": "number",
    "lastUpdateTimestamp": "number",
    "specifications": "null"
  }
}
```

#### `GET /api/manage-catalog/jobs`
- Source: `Inventory_Update.har` · status 200
- Query: `?jobType=UPDATE_LOCATION_SKU_STATUS&startTimestamp=1776178392&endTimestamp=1783954392&pageSize=5`

**Response**
```json
{
  "items": [],
  "pageCursor": "null"
}
```

### Reports & Dashboards

#### `GET /api/manage-catalog/reports/{id}`
- Source: `returns.har` · status 200
- Query: `?reportType=RETURNS_REPORT`

**Response**
```json
{
  "id": "string",
  "type": "string",
  "catalogOwnerId": "null",
  "status": "enum:\"SUBMITTED\"",
  "contentFileName": "null",
  "completionResult": {
    "<id>": "null"
  },
  "creationTimestamp": "number",
  "additionalInfo": "string"
}
```

#### `GET /api/quicksight/reports/dashboards/catalog-dashboard`
- Source: `Insights.har` · status 200

**Response**
_(not captured)_

#### `GET /api/quicksight/reports/dashboards/inventory-health-dashboard`
- Source: `Insights.har` · status 200

**Response**
_(not captured)_

#### `GET /api/quicksight/reports/dashboards/inventory-picture`
- Source: `Inventory_Dashboard.har` · status 200

**Response**
_(not captured)_

#### `GET /api/quicksight/reports/dashboards/return-insights-dashboard`
- Source: `Insights.har` · status 200

**Response**
_(not captured)_

#### `GET /api/quicksight/reports/dashboards/sales-dashboard`
- Source: `Insights.har` · status 200

**Response**
_(not captured)_

#### `GET /api/quicksight/reports/dashboards/shipping-dashboard`
- Source: `Insights.har` · status 200

**Response**
_(not captured)_

#### `POST /api/manage-catalog/reports`
- Source: `returns.har` · status 200

**Request body**
```json
{
  "reportType": "string",
  "reportParameters": {
    "startDate": "number",
    "endDate": "number"
  }
}
```

**Response**
_(not captured)_

---

## GraphQL Operations

All via `POST /api/graphql`. Response bodies are **base64-encoded JSON**.

### GetBulkPackConfig (query)
- Source: `1amazon_easy_ship.har`

**Query**
```graphql
query GetBulkPackConfig($input: LocationConfigurationInput!) { locationConfiguration(input: $input) { bulkPackConfiguration { apiInputSizeLimit concurrentBatches documentDownloadLimit } } }
```

**Variables**
```json
{
  "input": {
    "salesChannel": "enum:\"MFN\""
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "locationConfiguration": {
      "bulkPackConfiguration": {
        "<id>": "number"
      }
    }
  }
}
```

### GetPickTaskConfiguration (query)
- Source: `1amazon_easy_ship_missed.har`

**Query**
```graphql
query GetPickTaskConfiguration { locationConfiguration { pickTaskConfiguration { areSingleAndMultiSeparated batchSize multiShipmentBatchSize shipmentsBatchSizeForPeak singleShipmentBatchSize } } }
```

**Response (decoded)**
```json
{
  "data": {
    "locationConfiguration": {
      "pickTaskConfiguration": {
        "<id>": "boolean"
      }
    }
  }
}
```

### GetReturn (query)
- Source: `returns_1.har`

**Query**
```graphql
query GetReturn($input: GetReturnRequestInput!) { getReturn(input: $input) { returnDetails { id merchantId returnLocationId fulfillmentLocationId merchantSku numberOfUnits returnType effectiveStatus returnMetadata { returnReason fulfillmentOrderId rmaId invoiceInfo { invoiceId invoiceCreationTimestamp } } channelReturnAttributes { merchantId shipmentId customerOrderId returnLocationId exchangeOrderId channelSku marketplaceName marketplace channelName marketplaceRegion } creationTimestamp lastUpdatedTimestamp returnShippingInfo { deliveryTimestamp pickupTimestamp customerDroppedOffTimestamp sellerProcessedTimestamp forwardTrackingInfo { trackingId carrierName } reverseTrackingInfo { trackingId carrierName } } otpDetails { otp validTill } returnedWithOTP replanned previousTrackingInfo { trackingId carrierName } replacement exchange updatedBy postReturnStatus overallDisposition numberOfUnitsSellable numberOfUnitsUnsellable productImage productTitle } productDetails { productTitle productImage } } }
```

**Variables**
```json
{
  "input": {
    "id": "string"
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "getReturn": {
      "returnDetails": {
        "id": "string",
        "merchantId": "string",
        "returnLocationId": "string",
        "fulfillmentLocationId": "string",
        "merchantSku": "string",
        "numberOfUnits": "number",
        "returnType": "string",
        "effectiveStatus": "string",
        "returnMetadata": {
          "<id>": "string"
        },
        "channelReturnAttributes": {
          "<id>": "string"
        },
        "creationTimestamp": "number",
        "lastUpdatedTimestamp": "number",
        "returnShippingInfo": {
          "<id>": "null"
        },
        "otpDetails": "null",
        "returnedWithOTP": "boolean",
        "replanned": "boolean",
        "previousTrackingInfo": [
          {
            "trackingId": "string",
            "carrierName": "string"
          }
        ],
        "replacement": "boolean",
        "exchange": "boolean",
        "updatedBy": "string",
        "postReturnStatus": "string",
        "overallDisposition": "string",
        "numberOfUnitsSellable": "number",
        "numberOfUnitsUnsellable": "number",
        "productImage": "string",
        "productTitle": "string"
      },
      "productDetails": "null"
    }
  }
}
```

### PickTaskByFilters (query)
- Source: `1amazon_easy_ship.har`

**Query**
```graphql
query PickTaskByFilters($input: PickTasksByFilterRequestInput!) { pickTasksByFilter(input: $input) { id creationEpoch expectedShipEpoch attributes { batchSize hasFastTrackOrders hasGiftMessageOrders hasGiftOrders hasGiftWrapOrders hasHazmatOrders hasSidelineOrders hasSingleOrders hasTemperatureRatedOrders numberOfOrders salesChannelWithAttributesList { isSelfShip salesChannel displayableSalesChannel } } } }
```

**Variables**
```json
{
  "input": {
    "endExSD": "string",
    "startExSD": "string",
    "pickTaskType": "enum:\"CUSTOMER\"",
    "status": "enum:\"ACTIVE\""
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "pickTasksByFilter": [
      {
        "<id>": "string"
      }
    ]
  }
}
```

### RetrieveBatchOrderDocuments (query)
- Source: `1amazon_easy_ship.har`

**Query**
```graphql
query RetrieveBatchOrderDocuments($input: RetrieveBatchDocumentsInput!) { orderDocuments(input: $input) { result { ... on CombinedRetrieveBatchDocumentsResponse { fileGenerationPreference ordersIncluded fileDetails { url urlType } } } errors { errorMessage orderId } fileFormat requestedDocumentTypes } }
```

**Variables**
```json
{
  "input": {
    "<id>": [
      "string"
    ]
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "orderDocuments": {
      "result": {
        "<id>": "string"
      },
      "errors": [],
      "fileFormat": "enum:\"PDF\"",
      "requestedDocumentTypes": [
        "string"
      ]
    }
  }
}
```

### SearchReturns (query)
- Source: `returns.har`

**Query**
```graphql
query SearchReturns($input: SearchReturnsRequestInput!) { searchReturns(input: $input) { returns { returnId merchantId returnTrackingId forwardTrackingId customerOrderId shipmentId merchantSku channelSku channel marketplace program carrier effectiveStatus returnType lastUpdatedTimestamp overallDisposition postReturnStatus numberOfUnits numberOfUnitsSellable numberOfUnitsUnsellable creationTimestamp productImage productTitle } nextPageToken } }
```

**Variables**
```json
{
  "input": {
    "filters": {
      "effectiveStatus": [
        "string"
      ]
    },
    "pageSize": "number"
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "searchReturns": {
      "returns": [
        {
          "returnId": "string",
          "merchantId": "string",
          "returnTrackingId": "string",
          "forwardTrackingId": "string",
          "customerOrderId": "string",
          "shipmentId": "string",
          "merchantSku": "string",
          "channelSku": "string",
          "channel": "string",
          "marketplace": "enum:\"AMAZON_IN\"",
          "program": "string",
          "carrier": "string",
          "effectiveStatus": "string",
          "returnType": "string",
          "lastUpdatedTimestamp": "number",
          "overallDisposition": "null",
          "postReturnStatus": "null",
          "numberOfUnits": "number",
          "numberOfUnitsSellable": "null",
          "numberOfUnitsUnsellable": "null",
          "creationTimestamp": "number",
          "productImage": "string",
          "productTitle": "string"
        }
      ],
      "nextPageToken": "string"
    }
  }
}
```

### UpdateReturnItem (mutation)
- Source: `returns.har`

**Query**
```graphql
mutation UpdateReturnItem($input: UpdateReturnItemRequestInput!) { updateReturnItem(input: $input) { success returnId } }
```

**Variables**
```json
{
  "input": {
    "<id>": "string"
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "updateReturnItem": {
      "success": "boolean",
      "returnId": "string"
    }
  }
}
```

### Weblab (query)
- Source: `1amazon_easy_ship.har`

**Query**
```graphql
query Weblab { weblab { weblab isEnabled } }
```

**Response (decoded)**
```json
{
  "data": {
    "weblab": [
      {
        "weblab": "string",
        "isEnabled": "boolean"
      }
    ]
  }
}
```

### getInventoryItemsDetail (query)
- Source: `Inventory_Update.har`

**Query**
```graphql
query getInventoryItemsDetail($input: GetInventoryRequestInput!) { inventory(input: $input) { versionToUpdateInventory quantity reservedQuantity itemId } }
```

**Variables**
```json
{
  "input": {
    "itemId": "string"
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "inventory": {
      "versionToUpdateInventory": "number",
      "quantity": "number",
      "reservedQuantity": "number",
      "itemId": "string"
    }
  }
}
```

### updateInventoryQuantity (mutation)
- Source: `Inventory_Update.har`

**Query**
```graphql
mutation updateInventoryQuantity($input: UpdateInventoryRequestInput!) { updateInventory(input: $input) }
```

**Variables**
```json
{
  "input": {
    "versionToUpdateInventory": "number",
    "itemId": "string",
    "quantity": "number",
    "type": "string"
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "updateInventory": "boolean"
  }
}
```

---

## Coverage notes
- `quicksight/reports/dashboards/*` return embedded QuickSight dashboard URLs/config (sales, shipping, inventory-health, return-insights, catalog, inventory-picture).
- `manage-catalog/reports` (POST create + GET by id) drive async report/export generation (used by Returns export).
- Inventory writes: GraphQL `updateInventoryQuantity`; catalog reads: `getInventoryItemsDetail`, `GET /api/manage-catalog/items/{id}`, `GET /api/inbound/product-details`, `GET /api/manage-catalog/jobs`.
- Returns: GraphQL `SearchReturns`, `GetReturn`, `UpdateReturnItem`.

## TODO (pages to capture next)
- Cancellations list (for "Printed Cancelled")
- Manifest generation & handover
- Settings / rules / auto-allocation
- Any per-order detail / order-search endpoints
