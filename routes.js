var passport = require('passport')
var async = require('async')
var path = require('path')
var Account = require('./models/account')
var Call = require('./models/call')

var havenondemand = require('havenondemand')
var hodClient = new havenondemand.HODClient(process.env.HOD_APIKEY)

var twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

var languageObj ={'en-US-tel': {'regular': 'US English', 'sentiment-analysis': 'eng'}, 'en-GB-tel': {'regular': 'British English', 'sentiment-analysis': 'eng'}, 'es-ES-tel': {'regular': 'European Spanish', 'sentiment-analysis': 'spa'}, 'fr-FR-tel': {'regular': 'French', 'sentiment-analysis': 'fre'}, 'es-LA-tel': {'regular': 'Latin American Spanish', 'sentiment-analysis': 'spa'}}

// Helper functions
function obtainAudio(CallSid) {
  console.log("Obtaining audio")
  console.log(CallSid)
  twilioClient.calls(CallSid).get(function(err1, call) {
    console.log(call)
    if (err1) {
      console.log(err1)
    } else {
      var dateCreated = call.date_created
      twilioClient.recordings.get({
        callSid: CallSid,
      }, function(err2, data) {
        if (err2) {
          console.log(err2)
        } else {
          if (data.recordings.length > 0) { //if there is a recording
            console.log(data.recordings)
            data.recordings.forEach(function(recording) {
              var recordingUrl = "https://api.twilio.com"+recording.uri.split(".")[0]+".mp3"
              Call.update({'CallSid': CallSid}, {
                audio: true,
                RecordingUrl: recordingUrl,
                dateCreated: dateCreated
              }, function(err, numberAffected, rawResponse) {
                console.log("Audio file obtained for: " + CallSid)
              })
            })
          } else {
            obtainAudio(CallSid)
          }
        }
      })
    }
  })
}

function getAsyncResult(jobID, callback) {
  hodClient.getJobStatus(jobID, function(err, resp, body) {
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

function processText(textSnippetsArray, callback) {
  var oldAverage = 0
  var newAverage
  var counter = 1
  var text = ''
  async.each(textSnippetsArray, function(textInformation, c) {
    var confidence = textInformation['confidence']
    text += textInformation['content']
    newAverage = oldAverage * (counter-1)/counter + confidence/counter;   // New average = old average * (n-1)/n + new value /n
    oldAverage = newAverage; //set equal to new average for next go around of calling this function
    counter += 1
    console.log("Average: " + newAverage)
    console.log("confidence: " + confidence)
    if (counter > textSnippetsArray.length) {
      callback({aggregate: newAverage, text: text})
    }
    text += ' '
  }, function(err) {})
}

function createError(callSid) {
  Call.update({'CallSid': callSid}, {
    error: true
  }, function(err, numberAffected, rawResponse) {

  })
}

module.exports = function (app) {

  app.get('/', function(req, res) {
    var query = Call.find({})
    query.exec(function(err, calls) {
      if (err) {
        return handleError(err)
      } else {
        res.render('index', {
          calls: calls,
          user: req.user,
          admin: process.env.ADMIN
        })
      }
    })
  })

  app.get('/about', function(req, res) {
    res.render('about', {
      user: req.user,
      admin: process.env.ADMIN
    })
  })

  app.post('/search', function(req, res) {
    var searchText = req.body.search
    var data = {text: searchText, index: process.env.HOD_INDEX_NAME, print: 'all', absolute_max_results: 10}
    hodClient.call('querytextindex', data, function(err, resp, body) {
      if (resp) {
        if (resp.body) {
          if (resp.body.status == 'failed') {
            var documents = []
          } else {
            var documents = resp.body.documents
          }
          res.render('search_results', {
            calls: documents,
            user: req.user,
            admin: process.env.ADMIN
          })
        }
      }
    })
  })

  app.get('/findSimilar', function(req, res) {
    var indexReference = req.query.indexReference
    var data = {index_reference: indexReference, indexes: process.env.HOD_INDEX_NAME, print: 'all', absolute_max_results: 10}
    hodClient.call('findsimilar', data, function(err, resp, body) {
      if (resp) {
        if (resp.body) {
          var documents = resp.body.documents
          res.render('find_similar_results', {
            calls: documents,
            user: req.user,
            admin: process.env.ADMIN
          })
        }
      }
    })
  })

  app.get('/callcenter', function(req, res) {
    res.render('callcenter', {
      user: req.user,
      admin: process.env.ADMIN
    })
  })

  app.get('/call/:CallSid', function(req, res) {
    var CallSid = req.params.CallSid
    var query = Call.findOne({'CallSid': CallSid})
    query.exec(function(err, call) {
      if (err) {
        return handleError(err)
      } else {
        var language = languageObj[call.language]['regular']
        res.render('call', {
          call: call,
          language: language,
          user: req.user,
          admin: process.env.ADMIN
        })
      }
    })
  })

  app.get('/processCall', function(req, res) {
    var CallSid = req.query.CallSid
    var language = req.query.language
    var entityType = req.query.entity_type
    Call.findOne({ CallSid: CallSid }, function(error, doc1) {
      if (doc1.processing == false) {
        console.log("Processing call: " + CallSid)
        Call.update({'CallSid': CallSid}, {
          processing: true,
          language: language,
          entitiesSelected: entityType
        }, function(error1, numberAffected, rawResponse) {
          if (error1) {
            console.log(error1)
          } else {
            Call.findOne({ CallSid: CallSid }, function (error2, doc) {
              if (error2) {
                console.log(error2)
              } else {
                var recordingUrl = doc.RecordingUrl
                var To = doc.To
                var From = doc.From
                var dateCreated = doc.dateCreated
                var data1 = {url: recordingUrl, language: language, interval: 0}
                hodClient.call('recognizespeech', data1, true, function(err1, resp1, body1) {
                  var jobID = resp1.body.jobID
                  getAsyncResult(jobID, function(body) {
                    if (body == 'failed') {
                      createError(CallSid)
                    } else {
                      var textSnippets = body.actions[0].result.document
                      processText(textSnippets, function(textObj) {
                        var text = textObj.text
                        var confidenceAggregate = textObj.aggregate
                        console.log("Text: " + text)
                        if (text == "") {
                          createError(CallSid)
                        } else {
                          // Analyze using HOD
                          var sentimentAnalysisLanguage = languageObj[language]['sentiment-analysis']
                          var data2 = {text: text, language: sentimentAnalysisLanguage}
                          hodClient.call('analyzesentiment', data2, function(err2, resp2, body2) {
                            console.log("Analyzed sentiment")
                            var sentimentResponse = body2
                            var aggregateSentiment = resp2.body.aggregate.sentiment
                            var aggregateScore = resp2.body.aggregate.score
                            hodClient.call('extractconcepts', data2, function(err3, resp3, body3) {
                              console.log("Extracted concepts")
                              var conceptsResponse = body3
                              var data3 = {text: text, entity_type: entityType}
                              hodClient.call('extractentities', data3, function(err4, resp4, body4) {
                                console.log("Extracted entities")
                                var entityResponse = body4
                                var json = {
                                  document: [
                                    {
                                      content: text,
                                      CallSid: CallSid,
                                      aggregate_sentiment: aggregateSentiment,
                                      aggregate_score: aggregateScore,
                                      RecordingUrl: recordingUrl,
                                      TranscriptionText: text,
                                      confidence: confidenceAggregate,
                                      From: From,
                                      To: To,
                                      date: dateCreated,
                                      language: language
                                    }
                                  ]
                                }
                                var data4 = {
                                  index: process.env.HOD_INDEX_NAME,
                                  json: JSON.stringify(json)
                                }
                                hodClient.call('addtotextindex', data4, function(err5, resp5, body5) {
                                  // Mongo
                                  var indexReference = resp5.body.references[0].reference
                                  Call.update({'CallSid': CallSid}, {
                                    text: text,
                                    concepts: conceptsResponse,
                                    sentiments: sentimentResponse,
                                    entities: entityResponse,
                                    RecordingUrl: recordingUrl,
                                    TranscriptionText: text,
                                    indexed: true,
                                    processed: true,
                                    confidence: confidenceAggregate,
                                    indexReference: indexReference
                                  }, function(err, numberAffected, rawResponse) {
                                    console.log("Processed")
                                  })
                                })
                              })
                            })
                          })
                        }
                      })
                    }
                  })
                })
              }
            })
          }
        })
      } else {
        console.log("Call already processing! " + CallSid)
        res.redirect('/')
      }
    })
  })

  app.post('/makeCall', function(req, res) {
    var phonenumber = req.body.phonenumber
    twilioClient.calls.create({
        url: process.env.TWI_ML_URL,
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
          callObj['username'] = req.user.username
          var callMongo = new Call (callObj)
          callMongo.save(function (err) {
            if (err)  {
              console.log ('Error on save!')
            } else { //loop to obtain audio
              obtainAudio(call.sid)
            }
          })
        }
    })
    res.redirect('/')
  })

  app.post('/delete', function(req, res) {
    var CallSid = req.body.CallSid
    var indexReference = req.body.indexReference
    var data = {index: process.env.HOD_INDEX_NAME, index_reference: indexReference}
    Call.remove({CallSid: CallSid}, function(error) {
      if (error) return handleError(error)
      hodClient.call('deletefromtextindex', data, function(err, resp, body) {
        console.log(resp.body)
        if (err) console.log(err)
        res.redirect('/')
      })
    })
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

  //login stuff
  app.get('/register', function(req, res) {
    res.render('register', {
      user: req.user,
      admin: process.env.ADMIN
    })
  })

  app.post('/register', function(req, res) {
    Account.register(new Account({ username : req.body.username }), req.body.password, function(err, account) {
      if (err) {
        return res.render('register', {
          account : account,
          admin: process.env.ADMIN
        })
      }
      passport.authenticate('local')(req, res, function () {
        res.redirect('/')
      })
    })
  })

  app.get('/login', function(req, res) {
    res.render('login',  {
      user : req.user,
      admin: process.env.ADMIN
    })
  })

  app.post('/login', passport.authenticate('local'), function(req, res) {
    res.redirect('/')
  })

  app.get('/logout', function(req, res) {
    req.logout()
    res.redirect('/')
  })

}
