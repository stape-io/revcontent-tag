const BigQuery = require('BigQuery');
const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getContainerVersion = require('getContainerVersion');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeString = require('makeString');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');

/*==============================================================================
==============================================================================*/

const traceId = getRequestHeader('trace-id');

const eventData = getAllEventData();

const useOptimisticScenario = isUIFieldTrue(data.useOptimisticScenario);

if (!isConsentGivenOrNotRequired(data, eventData)) {
  return data.gtmOnSuccess();
}

const url = eventData.page_location || getRequestHeader('referer');
if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) {
  return data.gtmOnSuccess();
}

const actionHandlers = {
  page_view: handlePageViewEvent,
  conversion: handleConversionEvent
};

const handler = actionHandlers[data.type];
if (handler) {
  handler(data, eventData);
} else {
  return data.gtmOnFailure();
}

if (useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
Vendor related functions
==============================================================================*/

function handlePageViewEvent(data) {
  const url = eventData.page_location || getRequestHeader('referer');
  if (!url) return data.gtmOnSuccess();

  const cookieOptions = {
    domain: data.cookieDomain || 'auto',
    path: '/',
    secure: true,
    httpOnly: !!data.cookieHttpOnly,
    'max-age': 60 * 60 * 24 * (makeInteger(data.cookieExpiration) || 400)
  };

  const urlSearchParams = parseUrl(url).searchParams;

  const clickIdValue = urlSearchParams[data.clickIdParameterName || 'rc_uuid'];
  if (clickIdValue) {
    setCookie('rc_uuid', clickIdValue, cookieOptions, false);
  }

  return data.gtmOnSuccess();
}

function getRequestParameters(data, eventData) {
  const requestParameters = {};

  // Required parameters
  requestParameters.api_key = data.apiKey;
  requestParameters.rc_uuid = data.clickId || getCookieValues('rc_uuid')[0];
  requestParameters.amount = isValidValue(data.amount) ? makeInteger(data.amount) : undefined;

  // Optional parameters
  requestParameters.user_ip = data.hasOwnProperty('ipAddress')
    ? data.ipAddress
    : eventData.ip_override;
  requestParameters.user_agent = data.hasOwnProperty('userAgent')
    ? data.userAgent
    : eventData.user_agent;

  return requestParameters;
}

function getRequestUrl(requestParameters) {
  let requestUrl = 'https://trends.revcontent.com/api/v1/conversion.php';

  const requestParametersList = [];
  for (const key in requestParameters) {
    const value = requestParameters[key];
    if (isValidValue(value)) requestParametersList.push(enc(key) + '=' + enc(value));
  }

  requestUrl += '?' + requestParametersList.join('&');

  return requestUrl;
}

function areThereRequiredFieldsMissing(payload) {
  const requiredCommonFields = ['api_key', 'rc_uuid', 'amount'];

  const commonFieldsMissing = requiredCommonFields.some((p) => !isValidValue(payload[p]));
  if (commonFieldsMissing) return requiredCommonFields;
}

function handleConversionEvent(data, eventData) {
  const requestParameters = getRequestParameters(data, eventData);

  const missingFields = areThereRequiredFieldsMissing(requestParameters);
  if (missingFields) {
    log({
      Name: 'RevContent',
      Type: 'Message',
      TraceId: traceId,
      EventName: 'Conversion',
      Message: 'Request was not sent.',
      Reason: 'One or more required properties are missing: ' + missingFields.join(' or ')
    });

    return data.gtmOnFailure();
  }

  const requestUrl = getRequestUrl(requestParameters);

  log({
    Name: 'RevContent',
    Type: 'Request',
    TraceId: traceId,
    EventName: 'Conversion',
    RequestMethod: 'GET',
    RequestUrl: requestUrl
  });

  return sendHttpRequest(
    requestUrl,
    (statusCode, headers, body) => {
      log({
        Name: 'RevContent',
        Type: 'Response',
        TraceId: traceId,
        EventName: 'Conversion',
        ResponseStatusCode: statusCode,
        ResponseHeaders: headers,
        ResponseBody: body
      });

      if (!useOptimisticScenario) {
        if (statusCode >= 200 && statusCode < 400) {
          data.gtmOnSuccess();
        } else {
          data.gtmOnFailure();
        }
      }
    },
    {
      method: 'GET'
    }
  );
}

/*==============================================================================
Helpers
==============================================================================*/

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '';
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired() {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  const logDestinationsHandlers = {};
  if (determinateIsLoggingEnabled()) logDestinationsHandlers.console = logConsole;
  if (determinateIsLoggingEnabledForBigQuery()) logDestinationsHandlers.bigQuery = logToBigQuery;

  const keyMappings = {
    // No transformation for Console is needed.
    bigQuery: {
      Name: 'tag_name',
      Type: 'type',
      TraceId: 'trace_id',
      EventName: 'event_name',
      RequestMethod: 'request_method',
      RequestUrl: 'request_url',
      RequestBody: 'request_body',
      ResponseStatusCode: 'response_status_code',
      ResponseHeaders: 'response_headers',
      ResponseBody: 'response_body'
    }
  };

  for (const logDestination in logDestinationsHandlers) {
    const handler = logDestinationsHandlers[logDestination];
    if (!handler) continue;

    const mapping = keyMappings[logDestination];
    const dataToLog = mapping ? {} : rawDataToLog;

    if (mapping) {
      for (const key in rawDataToLog) {
        const mappedKey = mapping[key] || key;
        dataToLog[mappedKey] = rawDataToLog[key];
      }
    }

    handler(dataToLog);
  }
}

function logConsole(dataToLog) {
  logToConsole(JSON.stringify(dataToLog));
}

function logToBigQuery(dataToLog) {
  const connectionInfo = {
    projectId: data.logBigQueryProjectId,
    datasetId: data.logBigQueryDatasetId,
    tableId: data.logBigQueryTableId
  };

  dataToLog.timestamp = getTimestampMillis();

  ['request_body', 'response_headers', 'response_body'].forEach((p) => {
    dataToLog[p] = JSON.stringify(dataToLog[p]);
  });

  const bigquery =
    getType(BigQuery) === 'function' ? BigQuery() /* Only during Unit Tests */ : BigQuery;
  bigquery.insert(connectionInfo, [dataToLog], { ignoreUnknownValues: true });
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function determinateIsLoggingEnabledForBigQuery() {
  if (data.bigQueryLogType === 'no') return false;
  return data.bigQueryLogType === 'always';
}
