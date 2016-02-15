var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});


router.get('/mobilenos/:accountid/', function(req, res){
    var mobileNumbers = ["9901651997", "9886165860", "9994160330", "9677666498", "9942752200"];
    res.status(200).send(mobileNumbers);
});


router.get('/:accountid/:mobile', function(req, res){
    var customer = {
        "name" : "Kousik Kumar Gopalan",
        "Address": "7/37, Mariamman Kovil Street, Kurumbapalayam, Coimbatore 641107"
    }
    res.status(200).send(customer);
});

//APIs
router.post('/:accountid', function (req, res) {
    var account_id = req.params.accountid || " ";
    var name = req.body.name;
    var address = req.body.address;
    var zip = req.body.zip;
    var mobile = req.body.mobile_number;

    /*
     * Parse date and delivery slots
     */
    if (account_id == null || account_id == undefined) {
        res.status(400).send("Invalid account id");
        return;
    }


    /*
     * Validate mandatory fields
     */
    if (name == null || name == undefined) {
        res.status(400).send("Name is mandatory");
        return;
    }

    if (mobile == null || mobile == undefined) {
        res.status(400).send("Mobile number is mandatory");
        return;
    }

    if (address == null || address == undefined) {
        res.status(400).send("Address is mandatory");
        return;
    }

    if (zip == null || zip == undefined) {
        zip = "";
    }

    /*
     * Fill in the customer details to update
     */
    var customer_details = {
        address: address,
        mobilenumber: mobile,
        name: name,
        zip: zip
    }


    console.log(customer_details);

    res.status(200).send();
});

module.exports = router;
