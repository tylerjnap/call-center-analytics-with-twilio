require('dotenv').load()

var express = require('express')
var app = express()
var path = require('path')
var bodyParser = require('body-parser')
var urlencoded = bodyParser.urlencoded({extended: false})
app.use(urlencoded)
app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

var port = process.env.PORT || 5000

var havenondemand = require('havenondemand')
var hodClient = new havenondemand.HODClient(process.env.HOD_APIKEY)

var twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

app.get('/', function(req, res) {
  res.render('index', {

  })
})

app.get('/makeCall', function(req, res) {
  var query = req.query
  var phoneNumber = query.phoneNumber
  twilioClient.makeCall({
      url: "https://a606a4ed.ngrok.io/twilioVoice",
      // url: path.join(__dirname, '/twilioVoice')
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
  }, function(err, call) {
      if (err) {
        console.log(err)
      } else {
        process.stdout.write(call.sid)
      }
  })
})

app.post('/transcriptionComplete', function(req, res) {
  var body = req.body
  var text  = body['TranscriptionText']
  console.log(body)
  /*  Example response from body
  { ApiVersion: '2010-04-01',
  TranscriptionType: 'fast',
  TranscriptionSid: 'TRc724e7187f6d961aa8d78a4670bdb092',
  Called: '+15169671237',
  RecordingSid: 'REe29fde92a965ff0994693c4da1bc807d',
  CallStatus: 'completed',
  RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC3f1514f866d470cfd68ab42d9743752b/Recordings/REe29fde92a965ff0994693c4da1bc807d',
  From: '+15164505983',
  Direction: 'outbound-api',
  url: 'https://a606a4ed.ngrok.io/transcriptionComplete',
  AccountSid: 'AC3f1514f866d470cfd68ab42d9743752b',
  Caller: '',
  TranscriptionStatus: 'failed',
  CallSid: 'CA2b81270514a1f7809b9631e822b7a766',
  To: '+15169671237' }

  or

  { ApiVersion: '2010-04-01',
  TranscriptionType: 'fast',
  TranscriptionUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC3f1514f866d470cfd68ab42d9743752b/Recordings/REd894f1df6095c26d64e1e0ca447929f6/Transcriptions/TR09d62e76dc50ac92a02218532b6a4312',
  TranscriptionSid: 'TR09d62e76dc50ac92a02218532b6a4312',
  Called: '+15169671237',
  RecordingSid: 'REd894f1df6095c26d64e1e0ca447929f6',
  CallStatus: 'completed',
  RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC3f1514f866d470cfd68ab42d9743752b/Recordings/REd894f1df6095c26d64e1e0ca447929f6',
  From: '+15164505983',
  Direction: 'outbound-api',
  url: 'https://a606a4ed.ngrok.io/transcriptionComplete',
  AccountSid: 'AC3f1514f866d470cfd68ab42d9743752b',
  TranscriptionText: 'Able to answer my phone right now.  We read your moon.  Your number and a brief message and i\'ll get back to the same as possible.  At the tone.  Please record your message.  When you have finished recording.  You may hang up.  Or press 1 for more options. . \n\n If you are satisfied with your message.  Press 1.  To listen to your message.  Press 2.  To erase and record.  Press 3.  To continue recording where you left off.  Press for. ',
  Caller: '',
  TranscriptionStatus: 'completed',
  CallSid: 'CA2b81270514a1f7809b9631e822b7a766',
  To: '+15169671237' }
  */
    //perform HOD analytics
    if (text) {
      var data1 = {text: text}
      hodClient.call('analyzesentiment', data1, function(err1, resp1, body1) {
        var sentimentResponse = body1
        hodClient.call('extactconcepts', data1, function(err2, resp2, body2) {
          var conceptsResponse = body2
          //
            var data2 = {
              index: "twiliocallcenter",
              json: JSON.stringify({
                document: [
                  {
                    // title: counter.toString(),
                    body: body
                    content: text,
                    sentiments: sentimentResponse,
                    concepts: conceptsResponse
                  }
                ]
              })
            }
            client.call('addtotextindex', data2, function(err3, resp3, body3) {
              // save to mongo

              //

            })
          //
        })
      })
    }
    //
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
