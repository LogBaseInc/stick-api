var express = require('express');
var router = express.Router();
var http = require('http');
var fs = require('fs');

router.get('/:token/:gnss/:datatype/:lat/:lon/:pacc', function(req, res) {
    var token = req.params.token;
    var gnss = req.params.gnss;
    var datatype = req.params.datatype;
    var lat = req.params.lat;
    var lon = req.params.lon;
    var pacc = req.params.pacc;

    console.log(token, gnss, datatype, lat, lon, pacc);
    //url = 'http://online-live1.services.u-blox.com?token=' + token + ';gnss=' + gnss + ';datatype=' + datatype +
        //';lat=' + lat + ';lon=' + lon + ';pacc=' + pacc;
    url = 'http://online-live1.services.u-blox.com/GetOnlineData.ashx?token=6NJ2C2z0iEyw9vth6Le_YA;' +
        'gnss=gps,qzss;datatype=eph,aux,pos;lat=11.112053;lon=77.028011;alt=0.000000;pacc=1000.000000'
    console.log(url);
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

