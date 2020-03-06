var cc = DataStudioApp.createCommunityConnector();

var startTimer = 0;

function getConfig() {
  var config = cc.getConfig();

  config.newInfo()
   .setId('instructions')
  .setText('Please enter the configuration data for your Facebook connector');

  config.newTextInput()
      .setId('page_id')
      .setName('Enter your Facebook Page Id')
      .setHelpText('Find the page Id on the \'About\' section of your page')
      .setPlaceholder('Enter Facebook Page Id here')
      .setAllowOverride(false);

  config.setDateRangeRequired(true);

  return config.build();
}


function getFields(request) {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  var types = cc.FieldType;

  fields.newMetric()
    .setId('page_fans')
    .setType(types.NUMBER)

  fields.newDimension()
    .setId('day')
    .setType(types.YEAR_MONTH_DAY);

  return fields;
}

function getSchema() {
  return {
    schema: [
      {
        name: 'page_fans',
        label: 'Like number',
        dataType: 'NUMBER',
        semantics: {
          conceptType: 'METRIC'
        }
      },
      {
        name: 'day',
        label: 'Day',
        dataType: 'STRING',
        semantics: {
          conceptType: 'DIMENSION',
          semanticGroup: 'DATETIME',
          semanticType: 'YEAR_MONTH_DAY'
        }
      }
    ]
  };
}

function getDataFromAPI(requestedMetric,startDate,endDate,pageToken,requestEndpoint)
{
  var startDateMs = new Date(startDate).getTime() / 1000;
  var endDateMs = new Date(endDate).getTime() / 1000;
  
  var baseUrl = requestEndpoint+"insights?metric=";

  // If date range < 90 days
  const maxTimeDifference = 90*24*60*60;
  const oneDay = 24*60*60;
  
  if(endDateMs-startDateMs > maxTimeDifference)
  {
    console.log('More than 90 days')
    var startIntervalDate = startDateMs;
    var endIntervalDate = startIntervalDate + maxTimeDifference;
    
    var apiresponse = [];
    while(endIntervalDate<endDateMs)
    {
    
      var custom_url = baseUrl + requestedMetric + "&period=day&since="+startIntervalDate +"&until="+endIntervalDate +"&access_token="+pageToken;
      console.log(custom_url);

      
      // if list empty push the complete response
      if(apiresponse.length == 0) {
        console.log('if');
        apiresponse = JSON.parse(UrlFetchApp.fetch(custom_url));
      }
      else 
      {
        console.log('else');
        apiresponse.data[0].values = apiresponse.data[0].values.concat(JSON.parse(UrlFetchApp.fetch(custom_url)).data[0].values);
      }
      startIntervalDate = startIntervalDate + maxTimeDifference - oneDay;
      endIntervalDate = endIntervalDate + maxTimeDifference - oneDay;
      console.log(apiresponse.data[0].values);

    }
    console.log(apiresponse);
    console.log(apiresponse.data[0].values);

    
    return apiresponse;
  }
  else
  {
    console.log('Less than 90 days');
    var custom_url = baseUrl + requestedMetric + "&period=day&since="+startDateMs +"&until="+endDateMs +"&access_token="+pageToken;
    
    var resp = UrlFetchApp.fetch(custom_url);
    var apiresponse =  JSON.parse(resp);
    console.log(custom_url);
    console.log(resp);
    console.log(apiresponse);
    return apiresponse;
  }

  
}


function getData(request) {

  //Calculation of the time of the getData function
  startTimer = Date.now();

  //Extract info from request
  var pageId = request.configParams['page_id'];
  var startDate = request.dateRange.startDate;
  var endDate = request.dateRange.endDate;

  var requestEndpoint = "https://graph.facebook.com/v6.0/"+pageId+"/"


  //create de schema for the data
  var dataSchema = [];
  var fixedSchema = getSchema().schema;
  request.fields.forEach(function(field) {
    for (var i = 0; i < fixedSchema.length; i++) {
      if (fixedSchema[i].name == field.name) {
        dataSchema.push(fixedSchema[i]);
        break;
      }
    }
  });


  //Get the page token
  var tokenUrl = requestEndpoint+"?fields=access_token";
  var tokenResponse = UrlFetchApp.fetch(tokenUrl,
      {
        headers: { 'Authorization': 'Bearer ' + getOAuthService().getAccessToken() },
        muteHttpExceptions : true
      });
  var pageToken = JSON.parse(tokenResponse).access_token;




  var metrics = ['page_fans'];
  //var metrics = ['page_fans','page_fans_paid','page_impressions','page_impressions_paid','page_fans_country','page_fans_gender_age','page_fan_adds'];

  //Get data from API
  var response = getDataFromAPI(metrics[0],startDate,endDate,pageToken,requestEndpoint);

  // Parse tthe result
  //var parsedResponse = JSON.parse(response).data[0].values;
  var parsedResponse = response.data[0].values;


  var data = [];
  parsedResponse.forEach(function(fans) {
    var values = [];

    var fansTime = new Date(fans.end_time);
    // Google expects YYMMDD format
    var fansDate = fansTime.toISOString().slice(0, 10).replace(/-/g, "");

    // Provide values in the order defined by the schema.
    dataSchema.forEach(function(field) {
      switch (field.name) {
      case 'page_fans':
        values.push(fans.value);
        break;
      case 'day':
        values.push(fansDate);
        break;
      }
    });
    data.push({
      values: values
    });
  });

  return {
    schema: dataSchema,
    rows: data
  };

}


// Use for debug only, allow us to see the error code in data studio when somethhing is wrong.
function isAdminUser(){
 var email = Session.getEffectiveUser().getEmail();
  if( email == 'steven@itsnotthatkind.org' || email == 'analyticsintk@gmail.com' || email == 'quentin@itsnotthatkind.org'){
    return true;
  } else {
    return false;
  }
}



/**** BEGIN: OAuth Methods ****/
//ref : https://stickler.de/informationen/data-analytics/kostenloser-facebook-ads-google-datastudio-connector
function getAuthType() {
  var response = { type: 'OAUTH2' };
  return response;
}

function resetAuth() {
  getOAuthService().reset();
}

function isAuthValid() {
  return getOAuthService().hasAccess();
}

function getOAuthService() {
  return OAuth2.createService('exampleService')
    .setAuthorizationBaseUrl('https://www.facebook.com/dialog/oauth')
    .setTokenUrl('https://graph.facebook.com/v5.0/oauth/access_token')
    .setClientId(CLIENT_ID)
    .setClientSecret(CLIENT_SECRET)
    .setPropertyStore(PropertiesService.getUserProperties())
    .setCallbackFunction('authCallback')
    .setScope('pages_show_list, manage_pages, read_insights');
};

function authCallback(request) {
  var authorized = getOAuthService().handleCallback(request);
  if (authorized) {
    return HtmlService.createHtmlOutput('Success! You can close this tab.');
  } else {
    return HtmlService.createHtmlOutput('Denied. You can close this tab');
  };
};

function get3PAuthorizationUrls() {
  return getOAuthService().getAuthorizationUrl();
}

/**** END: OAuth Methods ****/