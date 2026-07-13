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
  "<id>": "boolean"
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
  "alertOnCurrentCycle": "boolean",
  "strikeOnPreviousCycle": "boolean",
  "previousCycleId": "number"
}
```

#### `GET /api/user/details`
- Source: `1amazon_easy_ship.har` · status 200
- Query: `?isV2=true`

**Response**
```json
{
  "localeDropdown": {
    "selectedDropdownItem": "string",
    "dropdownItems": [
      {
        "id": "string",
        "value": "string"
      }
    ]
  },
  "userLocale": "string",
  "displayableWarehouseInfoList": [
    {
      "warehouseId": "string",
      "displayName": "string",
      "address": {
        "line1": "string",
        "line2": "string",
        "line3": "string",
        "city": "string",
        "pinCode": "string"
      }
    }
  ],
  "multiWarehouseUser": "boolean"
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
  "warehouseId": "string",
  "displayWarehouseName": "string",
  "warehouseTimezone": "string",
  "warehouseType": "string",
  "warehouseIntegrator": "string",
  "warehouseOwnerId": "string",
  "warehouseTags": [],
  "warehouseSalesChannels": [
    {
      "stringId": "string",
      "value": "string",
      "selfShip": "boolean"
    }
  ],
  "orderAttributes": [
    {
      "stringId": "string",
      "value": "string"
    }
  ],
  "countryCode": "string",
  "dimensionUnitDisplayPreferences": {
    "defaultLengthUnit": "string",
    "defaultWeightUnit": "string",
    "validLengthUnits": [
      "string"
    ],
    "validWeightUnits": [
      "string"
    ]
  },
  "efpInventoryAPIIntegrationEnabled": "boolean",
  "primeBadgeStatus": "null",
  "platform": "string",
  "businessEntity": "string",
  "companyDetails": {
    "companies": {},
    "locationCompanyMappings": {},
    "merchantCompanyMappings": {}
  },
  "autoMerchantSelectionForInventoryAdjustmentEnabled": "boolean",
  "preInboundInvoiceUploadEnabled": "boolean",
  "userMLFSeller": "boolean",
  "templateBasedGiftMessageActive": "boolean",
  "handoverSidelineEnabled": "boolean",
  "customerInvoicePrintingRequired": "boolean",
  "setupPending": "boolean",
  "flexComboEnabled": "boolean",
  "onlyMFNSalesChannelSupported": "boolean",
  "primeBadgeCheckEnabled": "boolean",
  "printerResolutionSelectionEnabled": "boolean",
  "spooLabelScanEnabled": "boolean",
  "uvBoxFeatureEnabled": "boolean",
  "packingSlipGenerationAllowed": "boolean",
  "rapidPodHandoverEnabled": "boolean",
  "mpsEnabled": "boolean",
  "gettingStartedEnabledForLocationMarketplace": "boolean",
  "mrpEnabledForNonPharmaNode": "boolean",
  "safetEnabled": "boolean"
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
    "startTime": "number",
    "endTime": "number",
    "newOrders": "number",
    "pickedOrders": "number",
    "totalOrders": "number",
    "prePulledOrderCount": "number",
    "pickTasks": "null"
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
      "name": "string",
      "isSelfShip": "boolean",
      "salesChannel": "enum:\"MFN\""
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
      "name": "string",
      "isSelfShip": "boolean",
      "salesChannel": "enum:\"MFN\""
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
  "expectedShipEpoch": "number",
  "numberOfShipments": "number",
  "numberOfShipmentsPacked": "number",
  "numberOfConsumerCancelledShipments": "number",
  "numberOfSellerCancelledShipments": "number",
  "skuCustomerShipmentMapping": {
    "<id>": {
      "DKTzST1qJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "Dr7rW11TJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "D2pQm11bJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "DLzDKm1FJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "DTrSCS1WJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "DZRhpJ1pJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      },
      "DjL6CY1zJ": {
        "customerShipmentId": "string",
        "orderId": "string",
        "marketplaceId": "string",
        "shipmentType": "number",
        "salesChannel": "enum:\"MFN\"",
        "shipmentStatus": "enum:\"BOUND\"",
        "boxType": "enum:\"CUSTOM\"",
        "packingSlipDetails": {
          "fileName": "string",
          "fileEncryptionType": "string",
          "bucketName": "string"
        },
        "marketplaceInvoiceId": "string",
        "shipmentTotalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shipmentTotalTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "shippingChargePrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "shippingChargeTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "originalOrderDetails": "null",
        "shippingChargeTaxBreakup": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "totalScannedQuantity": "number",
        "boxRecommendationAttributes": "null",
        "shipmentCreationEpoch": "number",
        "invoiceCreationEpoch": "number",
        "encryptedShipToAddress": "null",
        "shipToAddress": "null",
        "expectedDeliveryEpoch": "null",
        "displayableSalesChannel": {
          "name": "string",
          "isSelfShip": "boolean",
          "salesChannel": "enum:\"MFN\""
        },
        "packageWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "itemsTotalWeight": {
          "value": "number",
          "unit": "enum:\"g\""
        },
        "packageLength": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageWidth": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "packageHeight": {
          "value": "number",
          "unit": "enum:\"CM\""
        },
        "pickupSlot": "null",
        "pickupSlotDateStartEpoch": "null",
        "recommendedSlotToPick": "null",
        "boxName": "null",
        "isComboShipment": "boolean",
        "isReturnAuthenticityTagRequired": "boolean",
        "returnAuthenticityTagRequiredSkus": [],
        "orderingOrderIds": [
          "string"
        ],
        "pickTaskId": "string",
        "selfShip": "boolean",
        "hazmat": "boolean",
        "fastTrack": "boolean",
        "gift": "boolean",
        "serialNumScannedForShipment": "boolean",
        "prescriptionRequired": "boolean",
        "shipLabelGenerated": "boolean",
        "packingSlipRequired": "boolean",
        "replacement": "boolean",
        "exchange": "boolean",
        "packingSlipRequiredForPharma": "boolean",
        "outboundVerificationRequired": "boolean"
      }
    }
  },
  "skuCustomerShipmentOrder": {
    "<id>": [
      "string"
    ]
  },
  "customerShipmentSkuMapping": {
    "DKcbFjj3J": {
      "976fee95-533e-4aaa-9191-f659c4061550": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DY4Zmk1FJ": {
      "39217580-ffc2-4357-ab6e-0f628624de1b": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      },
      "1529743b-d120-41f3-be53-b4320bb828f3": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DT47ml1FJ": {
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DKTzST1qJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DYRmpp1vJ": {
      "976fee95-533e-4aaa-9191-f659c4061550": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DrgClY1vJ": {
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DTrSCS1WJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "D54H8d1MJ": {
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "Djlr821cJ": {
      "39217580-ffc2-4357-ab6e-0f628624de1b": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      },
      "1529743b-d120-41f3-be53-b4320bb828f3": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "D2qZWb1yJ": {
      "1529743b-d120-41f3-be53-b4320bb828f3": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DF1b2NjCJ": {
      "976fee95-533e-4aaa-9191-f659c4061550": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DZJSmk11J": {
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "Dr7rW11TJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "D2pQm11bJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DFHJgy1rJ": {
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DjL6CY1zJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      },
      "dc3a7d43-5dee-43c3-9f7e-32fad2cf5842": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DLzDKm1FJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    },
    "DZRhpJ1pJ": {
      "0364c3b3-2b0a-415d-aa91-f717ee0137a7": {
        "sku": "string",
        "wsku": "null",
        "scannedId": "null",
        "title": "null",
        "binDispositionQuantityMap": {},
        "fnsku": "null",
        "msku": "null",
        "requestedQuantity": "number",
        "scannedQuantity": "number",
        "giftMessageTokenList": "null",
        "length": "null",
        "width": "null",
        "height": "null",
        "boxesPerUnit": "number",
        "totalPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxPrice": {
          "unit": "enum:\"INR\"",
          "value": "number"
        },
        "totalTaxBreakdown": [
          {
            "taxBreakupType": "string",
            "value": {
              "unit": "enum:\"INR\"",
              "value": "number"
            }
          }
        ],
        "giftWrapPrice": "null",
        "giftWrapTaxPrice": "null",
        "giftWrapTaxBreakdown": "null",
        "unmanagedAtDrop": "null",
        "giftWrap": "boolean"
      }
    }
  },
  "customerShipmentExpectedItemsAggregatedQuantity": {
    "DKcbFjj3J": "number",
    "DY4Zmk1FJ": "number",
    "DT47ml1FJ": "number",
    "DKTzST1qJ": "number",
    "DYRmpp1vJ": "number",
    "DrgClY1vJ": "number",
    "DTrSCS1WJ": "number",
    "D54H8d1MJ": "number",
    "Djlr821cJ": "number",
    "D2qZWb1yJ": "number",
    "DF1b2NjCJ": "number",
    "DZJSmk11J": "number",
    "Dr7rW11TJ": "number",
    "D2pQm11bJ": "number",
    "DFHJgy1rJ": "number",
    "DjL6CY1zJ": "number",
    "DLzDKm1FJ": "number",
    "DZRhpJ1pJ": "number"
  },
  "customerShipmentScannedItemsAggregatedQuantity": {
    "DKcbFjj3J": "number",
    "DY4Zmk1FJ": "number",
    "DT47ml1FJ": "number",
    "DKTzST1qJ": "number",
    "DYRmpp1vJ": "number",
    "DrgClY1vJ": "number",
    "DTrSCS1WJ": "number",
    "D54H8d1MJ": "number",
    "Djlr821cJ": "number",
    "D2qZWb1yJ": "number",
    "DF1b2NjCJ": "number",
    "DZJSmk11J": "number",
    "Dr7rW11TJ": "number",
    "D2pQm11bJ": "number",
    "DFHJgy1rJ": "number",
    "DjL6CY1zJ": "number",
    "DLzDKm1FJ": "number",
    "DZRhpJ1pJ": "number"
  },
  "externalIdToSkuMapping": "null",
  "scannableIdToEskuMapping": {
    "CAP-RAIN-BASEBALL-BLACK": [
      "string"
    ],
    "CAP-FULLNET-BLACK": [
      "string"
    ],
    "CAP-FULLNET-WHITE": [
      "string"
    ],
    "B097YT1CTH": [
      "string"
    ],
    "OCAP-RAIN-BASEBALL-NAVYBLUE": [
      "string"
    ],
    "CAP-RAIN-BASEBALL-GREY": [
      "string"
    ]
  },
  "eskuToEskuDetailMap": {
    "<id>": {
      "esku": "string",
      "wsku": "null",
      "channelSku": "null",
      "title": "null",
      "msku": "string",
      "imageUrl": "null",
      "productTitle": "string",
      "hazmatLabels": [],
      "mrp": "null"
    }
  },
  "trackingIdToCustomerShipmentIdMap": {},
  "bulkInvoiceAndShipLabelDocumentMetadata": "null",
  "packedCustomerShipmentMapping": {
    "DLntmG1lJ": {
      "customerShipmentId": "string",
      "orderId": "string",
      "lineItems": [
        {
          "eskuId": "string",
          "quantity": "number",
          "unmanagedAtDrop": "null"
        }
      ],
      "packageWeight": {
        "value": "number",
        "unit": "enum:\"g\""
      },
      "packageLength": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageWidth": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageHeight": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "boxName": "enum:\"CustomBox\"",
      "boxType": "enum:\"CUSTOM\"",
      "selectedPickupSlot": {
        "endEpoch": "number",
        "startEpoch": "number",
        "price": "null"
      },
      "salesChannel": "enum:\"MFN\"",
      "isSelfShip": "boolean",
      "packedDate": "number",
      "orderingOrderIds": [
        "string"
      ],
      "pickTaskId": "string",
      "carrierName": "string"
    },
    "DFXT0t1DJ": {
      "customerShipmentId": "string",
      "orderId": "string",
      "lineItems": [
        {
          "eskuId": "string",
          "quantity": "number",
          "unmanagedAtDrop": "null"
        }
      ],
      "packageWeight": {
        "value": "number",
        "unit": "enum:\"g\""
      },
      "packageLength": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageWidth": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageHeight": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "boxName": "enum:\"CustomBox\"",
      "boxType": "enum:\"CUSTOM\"",
      "selectedPickupSlot": {
        "endEpoch": "number",
        "startEpoch": "number",
        "price": "null"
      },
      "salesChannel": "enum:\"MFN\"",
      "isSelfShip": "boolean",
      "packedDate": "number",
      "orderingOrderIds": [
        "string"
      ],
      "pickTaskId": "string",
      "carrierName": "string"
    },
    "DptlmD1BJ": {
      "customerShipmentId": "string",
      "orderId": "string",
      "lineItems": [
        {
          "eskuId": "string",
          "quantity": "number",
          "unmanagedAtDrop": "null"
        }
      ],
      "packageWeight": {
        "value": "number",
        "unit": "enum:\"g\""
      },
      "packageLength": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageWidth": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "packageHeight": {
        "value": "number",
        "unit": "enum:\"CM\""
      },
      "boxName": "enum:\"RecommendedPackage\"",
      "boxType": "enum:\"CUSTOM\"",
      "selectedPickupSlot": {
        "endEpoch": "number",
        "startEpoch": "number",
        "price": "null"
      },
      "salesChannel": "enum:\"MFN\"",
      "isSelfShip": "boolean",
      "packedDate": "number",
      "orderingOrderIds": [
        "string"
      ],
      "pickTaskId": "string",
      "carrierName": "string"
    }
  }
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
  "boxDetailsMap": "null",
  "boxDetailsByBoxGroupMap": {
    "System": [
      {
        "boxBarcode": "string",
        "boxName": "enum:\"CUSTOM\"",
        "bindingExclusion": "null",
        "bindingInclusion": "null",
        "boxCategory": "string",
        "boxCost": "number",
        "baseCurrencyCode": "null",
        "maxHoldingQty": "number",
        "maxHoldingWeight": "number",
        "boxType": "enum:\"CUSTOM\"",
        "boxWeight": "number",
        "weightUOM": "string",
        "internalLength": "number",
        "internalWidth": "number",
        "internalHeight": "number",
        "externalLength": "number",
        "externalWidth": "number",
        "externalHeight": "number",
        "dimensionUOM": "string",
        "isActive": "boolean",
        "isVirtual": "boolean",
        "maxHoldingValue": "number",
        "volume": "number"
      }
    ]
  },
  "lastEvaluatedItemKey": "null"
}
```

#### `GET /api/pack/sideline-reasons`
- Source: `smarthub.amazon.in.har` · status 200

**Response**
```json
{
  "sidelineReasons": [
    {
      "optionId": "string",
      "translatableString": "string",
      "displayableInPackPage": "boolean",
      "pharmacyOnly": "boolean"
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
      "storageDetails": {
        "storageType": "string",
        "storageLocation": "string",
        "fileName": "string",
        "encryptionType": "string"
      },
      "orderChargeList": [
        {
          "orderChargeType": "string",
          "name": "string",
          "amount": {
            "value": "number",
            "currency": "string"
          },
          "tax": {
            "amount": {
              "value": "number",
              "currency": "string"
            },
            "name": "string",
            "rate": "number",
            "breakup": [
              {
                "amount": "…",
                "name": "…",
                "rate": "…"
              }
            ],
            "type": "null"
          }
        }
      ],
      "lineItemChargesMap": {
        "1": [
          {
            "amount": {
              "value": "number",
              "currency": "string"
            },
            "tax": {
              "amount": {
                "value": "…",
                "currency": "…"
              },
              "name": "string",
              "rate": "number",
              "breakup": [
                "…"
              ],
              "type": "null"
            },
            "lineItemChargeType": "string",
            "name": "string",
            "type": "null"
          }
        ]
      },
      "invoiceCreationTimestamp": "number",
      "invoiceId": "string"
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
      "selectedBoxId": "enum:\"RecommendedPackage\"",
      "customerShipmentId": "string",
      "shippingLabelPrinterResolution": "number",
      "pickupSlotId": "string",
      "salesChannel": "enum:\"MFN\""
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
        "packageId": "string",
        "trackingId": "string",
        "labels": [
          {
            "labelPayload": {
              "payload": "string",
              "encodingType": "enum:\"KMS_B64\""
            },
            "labelFormat": "string"
          }
        ],
        "pickUpEpochSeconds": "number",
        "carrierPickupWindow": {
          "startTimeInEpochSeconds": "number",
          "endTimeInEpochSeconds": "number"
        },
        "shipMethod": "null",
        "carrierName": "string"
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
        "packageId": "string",
        "pickupSlotsList": [
          {
            "slotId": "string",
            "carrierName": "null",
            "shipBy": "enum:\"MARKETPLACE\"",
            "pickupTimeStart": "number",
            "pickupTimeEnd": "number",
            "expectedDeliveryStartTimestamp": "null",
            "expectedDeliveryEndTimestamp": "null",
            "totalCharge": "null",
            "billedWeight": "null"
          }
        ],
        "recommendedPickupSlot": {
          "slotId": "string",
          "carrierName": "null",
          "shipBy": "enum:\"MARKETPLACE\"",
          "pickupTimeStart": "number",
          "pickupTimeEnd": "number",
          "expectedDeliveryStartTimestamp": "null",
          "expectedDeliveryEndTimestamp": "null",
          "totalCharge": "null",
          "billedWeight": "null"
        }
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
    "shipmentId": "string",
    "trackingId": "null",
    "customerOrderId": "string",
    "isFastTrack": "boolean",
    "cancellationReason": "enum:\"MARKETPLACE_INITIATED\"",
    "displayableSalesChannel": {
      "name": "string",
      "isSelfShip": "boolean",
      "salesChannel": "enum:\"MFN\""
    },
    "pendingActionReason": "null",
    "orderingOrderIds": [
      "string"
    ]
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
    "pickupTime": "number",
    "totalOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "pendingOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "newOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "assignedToPicklistOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "sidelinedOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "packedOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "shippedOrders": {
      "total": "number",
      "fastTrack": "number"
    },
    "cancelledOrders": {
      "total": "number",
      "fastTrack": "number"
    }
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
  "scannedId": "string",
  "isUniqueProduct": "null",
  "eskuDetailList": [
    {
      "title": "string",
      "unlocalizedTitle": "string",
      "imageUrl": "null",
      "asin": "null",
      "channelSku": "string",
      "channelName": "string",
      "length": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\"",
        "dimensionOverrideType": "null"
      },
      "width": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\"",
        "dimensionOverrideType": "null"
      },
      "height": {
        "measure": "number",
        "unitOfMeasure": "enum:\"CM\"",
        "dimensionOverrideType": "null"
      },
      "weight": {
        "measure": "number",
        "unitOfMeasure": "enum:\"kg\"",
        "dimensionOverrideType": "null"
      },
      "externalIds": [],
      "validDimensions": "boolean",
      "shelfLifeInDays": "null",
      "amazonPadTimeInDays": "null",
      "amazonProductGroupType": "string",
      "amazonProductSubcategoryId": "null",
      "hasMRP": "boolean",
      "temperatureRating": "null",
      "productDimensions": "null",
      "numberOfBoxes": "null",
      "boxDimensionsList": "null",
      "medicineClassification": "null",
      "hazmat": "boolean",
      "mid": "string",
      "inboundValidationRequired": "boolean",
      "batchIdRequired": "boolean",
      "expirable": "boolean",
      "esku": "string",
      "msku": "string",
      "renewedScanRequired": "boolean",
      "mrpVerificationRequired": "boolean",
      "expiryDateVerificationRequired": "boolean",
      "wskuDetail": "null",
      "batchIdVerificationRequired": "boolean",
      "activeCombo": "boolean",
      "active": "boolean"
    }
  ]
}
```

#### `GET /api/manage-catalog/items/{id}`
- Source: `Inventory_Update.har` · status 200
- Query: `?relationship-type=BUNDLE&query=query getCatalogItemQuery {  getCatalogItemById(id:"{id}", dataEnrichmentAttributes: {listings:ALL relationships:ID_ONLY}) {responseType catalogItem{id catalogOwnerId c…`

**Response**
```json
{
  "catalogItem": {
    "id": "string",
    "catalogOwnerId": "string",
    "customId": "string",
    "sizeGuide": "null",
    "status": "enum:\"ACTIVE\"",
    "identifiers": [],
    "attributes": {
      "title": "string",
      "description": "null",
      "imageURLs": "null",
      "measurements": {
        "dimensions": {
          "length": {
            "unit": "enum:\"CM\"",
            "value": "number"
          },
          "width": {
            "unit": "enum:\"CM\"",
            "value": "number"
          },
          "height": {
            "unit": "enum:\"CM\"",
            "value": "number"
          }
        },
        "weight": {
          "unit": "enum:\"KG\"",
          "value": "number"
        }
      },
      "complianceAttributes": {
        "priceAttributes": {
          "isMrpRequired": "boolean",
          "mrp": "null"
        },
        "isExpirable": "boolean",
        "isLotNumberRequired": "boolean",
        "isSerialNumberRequired": "boolean",
        "isRenewedScanRequired": "null",
        "isHazmat": "null"
      },
      "isBestSeller": "null",
      "businessSpecificAttributes": "null",
      "numberOfParts": "null",
      "partAttributes": "null",
      "localizedTitles": "null",
      "taxAttributes": "null"
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
  },
  "catalogRelationshipItems": [],
  "isComboSku": "boolean",
  "isActiveComponentSku": "boolean"
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
    "totalSuccessfulTasks": "null",
    "totalFailedTasks": "null",
    "successReportUrl": "null",
    "failureReportUrl": "null",
    "failureMessage": "null"
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
        "apiInputSizeLimit": "number",
        "concurrentBatches": "number",
        "documentDownloadLimit": "number"
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
        "areSingleAndMultiSeparated": "boolean",
        "batchSize": "number",
        "multiShipmentBatchSize": "number",
        "shipmentsBatchSizeForPeak": "null",
        "singleShipmentBatchSize": "number"
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
          "returnReason": "string",
          "fulfillmentOrderId": "string",
          "rmaId": "null",
          "invoiceInfo": {
            "invoiceId": "string",
            "invoiceCreationTimestamp": "null"
          }
        },
        "channelReturnAttributes": {
          "merchantId": "string",
          "shipmentId": "string",
          "customerOrderId": "string",
          "returnLocationId": "string",
          "exchangeOrderId": "null",
          "channelSku": "string",
          "marketplaceName": "string",
          "marketplace": "enum:\"AMAZON\"",
          "channelName": "string",
          "marketplaceRegion": "string"
        },
        "creationTimestamp": "number",
        "lastUpdatedTimestamp": "number",
        "returnShippingInfo": {
          "deliveryTimestamp": "null",
          "pickupTimestamp": "null",
          "customerDroppedOffTimestamp": "null",
          "sellerProcessedTimestamp": "null",
          "forwardTrackingInfo": {
            "trackingId": "string",
            "carrierName": "string"
          },
          "reverseTrackingInfo": {
            "trackingId": "string",
            "carrierName": "string"
          }
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
        "id": "string",
        "creationEpoch": "number",
        "expectedShipEpoch": "number",
        "attributes": {
          "batchSize": "number",
          "hasFastTrackOrders": "boolean",
          "hasGiftMessageOrders": "boolean",
          "hasGiftOrders": "boolean",
          "hasGiftWrapOrders": "null",
          "hasHazmatOrders": "boolean",
          "hasSidelineOrders": "null",
          "hasSingleOrders": "boolean",
          "hasTemperatureRatedOrders": "boolean",
          "numberOfOrders": "number",
          "salesChannelWithAttributesList": [
            {
              "isSelfShip": "boolean",
              "salesChannel": "enum:\"MFN\"",
              "displayableSalesChannel": "string"
            }
          ]
        }
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
    "orderIds": [
      "string"
    ],
    "marketplace": "enum:\"AMAZON\"",
    "requiredDocumentTypes": [
      "string"
    ],
    "preferences": {
      "fileFormat": "enum:\"PDF\"",
      "fileGenerationPreference": "enum:\"COMBINED\""
    }
  }
}
```

**Response (decoded)**
```json
{
  "data": {
    "orderDocuments": {
      "result": {
        "fileGenerationPreference": "enum:\"COMBINED\"",
        "ordersIncluded": [
          "string"
        ],
        "fileDetails": {
          "url": "string",
          "urlType": "enum:\"S3_PRESIGNED_URL\""
        }
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
    "returnId": "string",
    "lastUpdatedTimestamp": "number",
    "gradingInput": {
      "numberOfUnitsSellable": "number",
      "numberOfUnitsUnsellable": "number"
    },
    "updateSellableInventory": "boolean"
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

## Notes on key endpoints

### GET /api/orders/details — general order listing (NOT just cancellations)
Lists individual shipments filtered by status. Powerful: it returns the actual
orders (with ids), unlike `orders/summary` which returns only counts.
- **Query params:** `exSD` (expected-ship-date epoch, seconds) · `shipmentStatus`
  (e.g. `CANCELLED`, and likely `BOUND`/`PACKED`/`SHIPPED` — confirm) ·
  `exclusiveStartRecordNumber` (pagination cursor, start 0).
- **Each row:** `shipmentId` (== our customerShipmentId), `customerOrderId`,
  `trackingId`, `isFastTrack`, `cancellationReason`, `displayableSalesChannel`,
  `orderingOrderIds`.
- **cancellationReason values seen:** `MARKETPLACE_INITIATED` (Amazon),
  `ORDER_DETAILS_CANCELLATION_REASON_CONSUMER_REQUESTED` (Flipkart).
- **Use:** "Printed Cancelled" = intersect `shipmentId` (status=CANCELLED) with
  locally printed orders. Paginate via `exclusiveStartRecordNumber` until empty.

## Coverage notes
- `quicksight/reports/dashboards/*`: embedded QuickSight dashboards (sales, shipping, inventory-health, return-insights, catalog, inventory-picture).
- `manage-catalog/reports` (POST create + GET by id): async report/export jobs (Returns export).
- Inventory: GraphQL `updateInventoryQuantity` (write), `getInventoryItemsDetail`; `GET /api/manage-catalog/items/{id}`, `/api/manage-catalog/jobs`, `/api/inbound/product-details`.
- Returns: GraphQL `SearchReturns`, `GetReturn`, `UpdateReturnItem`.

## TODO (pages to capture next)
- Manifest generation & handover
- Settings / rules / auto-allocation
- orders/details with other shipmentStatus values (to confirm the full order-listing use)
