const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
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
      EventName: 'Conversion',
      Message: '🛑 [ERROR] Request was not sent.',
      Reason: 'One or more required properties are missing: ' + missingFields.join(' or ')
    });

    return data.gtmOnFailure();
  }

  const requestUrl = getRequestUrl(requestParameters);

  return sendHttpRequest(
    requestUrl,
    (statusCode, headers, body) => {
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
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  logToConsole(JSON.stringify(rawDataToLog));
}
