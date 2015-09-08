var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var port = process.env.PORT || process.env.STICK_API_PORT || 3000;
app.use(bodyParser.text(limit=2048));
app.use(bodyParser.raw(limit=2048));

//Routes
var locations = require('./routes/locations');
app.use('/api/locations', locations);

var events = require('./routes/events');
app.use('/api/events', events);

var alerts = require('./routes/alerts');
app.use('/api/alerts', alerts);

var assistnow = require('./routes/assistnow');
app.use('/api/assist', assistnow);

app.listen(port);
console.log('Stick App listening on port 3000');
