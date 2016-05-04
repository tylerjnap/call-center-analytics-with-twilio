require('dotenv').load()

var twilio = require('twilio')
var twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
var resp = new twilio.TwimlResponse()


// resp.say('Welcome to Acme Customer Service!')
//     .gather({
//         action:'http://www.example.com/callFinished.php',
//         finishOnKey:'*'
//     }, function(node) { //note the use of the "node" variable in the anonymous function
//
//         //Now you can use this reference as well, if using "this" wrankles you
//         node.say('Press 1 for customer service')
//             .say('Press 2 for British customer service', { language:'en-gb' });
//
//     });
//
// console.log(resp.toString());

twilioClient.makeCall({
    url: "https://a606a4ed.ngrok.io/twilioVoice",
    to: process.env.MY_PHONE_NUMBER,
    from: process.env.TWILIO_PHONE_NUMBER
}, function(err, call) {
    if (err) {
      console.log(err)
    } else {
      process.stdout.write(call.sid)
    }
});
