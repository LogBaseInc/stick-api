var express = require('express');
var app = express();

//Routes
var locations = require('./routes/locations');
app.use('/api/locations', locations);

var events = require('./routes/events');
app.use('/api/events', events);

var alerts = require('./routes/alerts');
app.use('/api/alerts', alerts);

app.listen(3000);
console.log('Stick App listening on port 3000');