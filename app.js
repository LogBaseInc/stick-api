var express = require('express');
var app = express();
var bodyParser = require('body-parser');

var port = process.env.PORT || process.env.STICK_API_PORT || 3000;
app.use(bodyParser.text(limit=2048));
app.use(bodyParser.raw(limit=2048));
app.use(bodyParser.json());

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik";

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick", "write-dev", "info"],
    json:true
});

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
    client.log({ "url" : req.url, "body" : req.body,  "method" : req.method, "params" : req.params});
    next();
});

//Routes
var locations = require('./routes/locations');
app.use('/api/locations', locations);

var events = require('./routes/events');
app.use('/api/events', events);

var alerts = require('./routes/alerts');
app.use('/api/alerts', alerts);

var assistnow = require('./routes/assistnow');
app.use('/api/assist', assistnow);

var orders = require('./routes/orders');
app.use('/api/orders', orders);

var customers = require('./routes/customers');
app.use('/api/customers', customers);

var products = require('./routes/products');
app.use('/api/products', products);

var stats = require('./routes/stats');
app.use('/api/stats', stats);

app.listen(port);
console.log('Stick App listening on port 3000');
