var express = require('express');
var app = express();

var port = process.env.STICK_API_PORT || 3000;

//Routes
var locations = require('./routes/locations');
app.use('/api/locations', locations);

var events = require('./routes/events');
app.use('/api/events', events);

var alerts = require('./routes/alerts');
app.use('/api/alerts', alerts);

app.listen(port);
console.log('Stick App listening on port 3000');