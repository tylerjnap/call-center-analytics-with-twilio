var env = process.env.NODE_ENV || 'dev'
var path = require('path')

if (env == 'dev') {
  require('dotenv').load()
}

var express = require('express')
var app = express()
var bodyParser = require('body-parser')
var urlencoded = bodyParser.urlencoded({extended: false})
var mongoose = require('mongoose')
var async = require('async')
var passport = require('passport')
var LocalStrategy = require('passport-local').Strategy
var morgan = require('morgan')
var methodOverride = require('method-override')
var cookieParser = require('cookie-parser')
var session = require('express-session')

app.use(express.static(path.join(__dirname, 'public')))
app.use('/bower_components',  express.static(__dirname + '/bower_components'))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(cookieParser())
app.use(urlencoded)
app.use(morgan('combined'))
app.use(methodOverride('X-HTTP-Method-Override'))
app.use(session({
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  secret: 'keyboard cat'
}));
app.use(passport.initialize())
app.use(passport.session())

var Account = require('./models/account')
passport.use(new LocalStrategy(Account.authenticate()))
passport.serializeUser(Account.serializeUser())
passport.deserializeUser(Account.deserializeUser())

var Call = require('./models/call')

var port = process.env.PORT || 5000
var uristring = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/test'

var havenondemand = require('havenondemand')
var hodClient = new havenondemand.HODClient(process.env.HOD_APIKEY)

var twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

var languageObj ={'en-US-tel': {'regular': 'US English', 'sentiment-analysis': 'eng'}, 'en-GB-tel': {'regular': 'British English', 'sentiment-analysis': 'eng'}, 'es-ES-tel': {'regular': 'European Spanish', 'sentiment-analysis': 'spa'}, 'fr-FR-tel': {'regular': 'French', 'sentiment-analysis': 'fre'}}

mongoose.connect(uristring, function (err, res) {
  if (err) {
  console.log ('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
  console.log ('Succeeded connected to: ' + uristring);
  }
})

require('./routes')(app)

app.listen(port, function() {
  console.log('Listening on port: ' + port)
})
