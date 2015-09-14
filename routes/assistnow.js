var express = require('express');
var router = express.Router();
var http = require('http');
var fs = require('fs');

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik"

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick"],
    json:true
});

router.get('/:lat/:lon/:version/:source_id', function(req, res) {
    var lat = req.params.lat;
    var lon = req.params.lon;
    var source_id = req.params.source_id

    //gnss=gps,glo,qzss;datatype=eph,alm,aux,pos;

    url = 'http://online-live1.services.u-blox.com/GetOnlineData.ashx?token=6NJ2C2z0iEyw9vth6Le_YA;' +
        'gnss=gps,qzss,glo;datatype=eph,aux,pos;lat=' + lat + ';lon=' + lon + ';alt=0.000000;pacc=1000.000000';
    console.log(url);
    client.log({"url" : url}, ["debug", "assistnow", source_id]);
    var buffer = null;
    var request = http.get(url, function(response) {
        if (response.statusCode === 200) {
            response.on('data', function (chunk) {
                var buf = new Buffer(chunk);
                //console.log("BUFFER " + buf);
                if (!buffer) {
                    buffer = buf;
                } else {
                    buffer = Buffer.concat([buffer , buf]);
                }
            });

            response.on('end', function() {
                res.send(buffer);
            })
        } else {
            res.status(200).end();
        }
        // Add timeout.
        request.setTimeout(12000, function () {
            request.abort();
            res.status(200).end();
        });
    });
});


module.exports = router;

