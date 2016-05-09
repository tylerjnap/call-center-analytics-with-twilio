var env = process.env.NODE_ENV || 'dev'

if (env == 'dev') {
  require('dotenv').load()
  var twiMLUrl = "https://9fccd4b6.ngrok.io/twilioVoice"
} else {
  var twiMLUrl = path.join(__dirname, '/twilioVoice')
}

var express = require('express')
var app = express()
var path = require('path')
var bodyParser = require('body-parser')
var urlencoded = bodyParser.urlencoded({extended: false})
var mongoose = require('mongoose')

app.use(urlencoded)
app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

var port = process.env.PORT || 5000
var uristring = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/test'

var havenondemand = require('havenondemand')
var hodClient = new havenondemand.HODClient(process.env.HOD_APIKEY)

var twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

mongoose.connect(uristring, function (err, res) {
  if (err) {
  console.log ('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
  console.log ('Succeeded connected to: ' + uristring);
  }
})

var schema = new mongoose.Schema({
  created: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false },
  processing: { type: Boolean, default: false },
  error: { type: Boolean, default: false },
  indexed: { type: Boolean, default: false },
  concepts: mongoose.Schema.Types.Mixed,
  sentiments: mongoose.Schema.Types.Mixed,
  ApiVersion: String,
  TranscriptionType: String,
  TranscriptionUrl: String,
  TranscriptionSid: String,
  Called: String,
  RecordingSid: String,
  CallStatus: String,
  RecordingUrl: String,
  From: String,
  Direction: String,
  url: String,
  AccountSid: String,
  TranscriptionText: String,
  Caller: String,
  TranscriptionStatus: String,
  CallSid: String,
  To: String
})

var Call = mongoose.model('Call', schema);

app.get('/', function(req, res) {
  var query = Call.find({})
  query.exec(function(err, calls) {
    if (err) {
      return handleError(err)
    } else {
      res.render('index', {
        calls: calls
      })
    }
  })
})

app.get('/callcenter', function(req, res) {
  res.render('callcenter', {})
})

app.get('/call/:CallSid', function(req, res) {
  var CallSid = req.params.CallSid
  var query = Call.findOne({'CallSid': CallSid})
  query.exec(function(err, call) {
    if (err) {
      return handleError(err)
    } else {
      res.render('call', {
        call: call
      })
    }
  })
})

app.get('/processCall', function(req, res) {
  var CallSid = req.query.CallSid
  Call.update({'CallSid': CallSid}, {
    processing: true
  }, function(err, numberAffected, rawResponse) {
    //
    twilioClient.calls(CallSid).get(function(err, call) {
      if (err) {
        console.log(err)
      } else {
        twilioClient.recordings.get({
          callSid: CallSid,
        }, function(err, data) {
          console.log("Obtained recordings")
          console.log(data.recordings)
          //
          if (data.recordings.length > 0) { //if there is a recording
            data.recordings.forEach(function(recording) {
              debugger
              //CHECK HERE IF data.recordings.length == 0. IF IT IS, THEN DON'T EXECUTE REST OF JOBS
              // var recordingUrl = "https://"+process.env.TWILIO_ACCOUNT_SID+":"+process.env.TWILIO_AUTH_TOKEN+"@"+"api.twilio.com"+recording.uri.split(".")[0]+".mp3"
              var recordingUrl = "https://api.twilio.com"+recording.uri.split(".")[0]+".mp3"
              var data1 = {url: recordingUrl, language: 'en-US-tel'}
              // debugger
              hodClient.call('recognizespeech', data1, true, function(err1, resp1, body1) {
                var jobID = resp1.body.jobID
                // debugger
                getAsyncResult(jobID, function(body) {
                  // debugger
                  if (body == 'failed') {
                    createError(CallSid)
                  } else {
                    //continue
                    var text = body.actions[0].result.document[0].content
                    console.log("Text: " + text)
                    if (text == "") {
                      createError(CallSid)
                    } else {
                      // HOD stuff
                      var data2 = {text: text}
                      hodClient.call('analyzesentiment', data2, function(err2, resp2, body2) {
                        // debugger
                        console.log("Analyzed sentiment")
                        var sentimentResponse = body2
                        hodClient.call('extractconcepts', data2, function(err3, resp3, body3) {
                          // debugger
                          console.log("Extracted concepts")
                          var conceptsResponse = body3
                          var data3 = {
                            index: "twiliocallcenter",
                            json: JSON.stringify({
                              document: [
                                {
                                  // title: counter.toString(),
                                  // body: body
                                  content: text,
                                  // sentiments: sentimentResponse,
                                  // concepts: conceptsResponse
                                }
                              ]
                            })
                          }
                          hodClient.call('addtotextindex', data3, function(err4, resp4, body4) {
                            // mongo
                            // debugger
                            Call.update({'CallSid': CallSid}, {
                              text: text,
                              concepts: conceptsResponse,
                              sentiments: sentimentResponse,
                              RecordingUrl: recordingUrl,
                              TranscriptionText: text,
                              indexed: true,
                              processed: true
                            }, function(err, numberAffected, rawResponse) {
                              console.log("Processed")
                            })
                            //
                          })
                        })
                      })
                    }
                    // HOD stuff
                  }
                })
              })
              //
            //  console.log(recording.Sid)
            })
          } else { // if there is no recording yet
            Call.update({'CallSid': CallSid}, {
              processing: false
            }, function(err, numberAffected, rawResponse) {

            })
          }
        })
      }
    })
  })
})

function getAsyncResult(jobID, callback) {
  hodClient.getJobStatus(jobID, function(err, resp, body) {
    // debugger
    if (resp.body['status'] != 'finished') {
      if (resp.body.actions[0].status == 'failed') {
        callback('failed')
      } else {
        getAsyncResult(jobID, callback)
      }
    } else {
      callback(body)
    }
  })
}

function createError(callSid) {
  Call.update({'CallSid': callSid}, {
    error: true
  }, function(err, numberAffected, rawResponse) {

  })
}

app.post('/makeCall', function(req, res) {
  // var query = req.query
  var phonenumber = req.body.phonenumber
  // var phoneNumber = query.phoneNumber
  twilioClient.calls.create({
      url: twiMLUrl,
      to: phonenumber,
      from: process.env.TWILIO_PHONE_NUMBER
  }, function(err, call) {
      if (err) {
        console.log(err)
      } else {
        console.log(call)
        process.stdout.write(call.sid)
        var callObj = {}
        callObj['CallSid'] = call.sid
        callObj['To'] = call.to
        callObj['From'] = call.from
        var callMongo = new Call (callObj)
        callMongo.save(function (err) {if (err) console.log ('Error on save!')})
      }
  })
  res.redirect('/')
})

// Function for getting Twilio XML file
app.post('/twilioVoice', function(req, res) {
  var fileName = path.join(__dirname, '/twilioVoice.xml')
  res.sendFile(fileName, function (err) {
    if (err) {
      console.log(err)
    }
  })
})

app.listen(port, function() {
  console.log('Listening on port: ' + port)
})
