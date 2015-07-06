var express = require('express');
var app = express();

var locations = require('./routes/locations');

//Routes
app.use('/api/locations', locations);
app.use('/api/events', events);

app.listen(3000);
console.log('Stick App listening on port 3000');