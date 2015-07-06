var express = require('express');
var app = express();

var locations = require('./routes/locations');

app.use('/api/locations', locations);

app.listen(3000);
console.log('Stick App listening on port 3000');