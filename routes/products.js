var express = require('express');
var router = express.Router();
var AWS = require('aws-sdk');
var utils = require('./utils.js');
AWS.config.update({region: 'us-east-1'});
var DYNAMODB_PRODUCTS_TABLE_NAME = "StickProducts";
var dynamodb = new AWS.DynamoDB({apiVersion: 'latest'});
var DYNAMODB_BATCH_WRITE_LIMIT = 1;

var loggly = require('loggly');
var loggly_token = process.env.LOGGLY_TOKEN || "7b9f6d3d-01ed-45c5-b4ed-e8d627764998";
var loggly_sub_domain = process.env.LOGGLY_SUB_DOMAIN || "kousik"

var client = loggly.createClient({
    token: loggly_token,
    subdomain: loggly_sub_domain,
    tags: ["stick", "customers"],
    json:true
});

router.get('/brief/:accountid', function(req, res){
    var account_id = req.params.accountid || " ";
    var resp_data = [];
    var prev_result = null;

    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    fetchProducts(account_id, null, resp_data, res, true);
});

router.get('/:accountid', function(req, res){
    var account_id = req.params.accountid || " ";
    var resp_data = [];
    var prev_result = null;

    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    fetchProducts(account_id, null, resp_data, res, false);
});

router.post('/:accountid', function (req, res) {
    var account_id = req.params.accountid || " ";
    var products = req.body;
    var product_list = [];

    if (products.length == 0) {
        res.status(400).send("Invalid request. No products provided")
        return;
    }

    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    for (var idx in products) {
        var name = products[idx].name;
        var description = products[idx].description;
        var price = products[idx].price;
        var unit = products[idx].unit;
        var inventory = products[idx].inventory;
        var uuid = products[idx].uuid;

        /*
         * Validate mandatory fields
         */
        if (name == null || name == undefined) {
            res.status(400).send("Name is mandatory");
            return;
        }

        if (uuid == null || uuid == undefined) {
            res.status(400).send("Product uuid is mandatory");
            return;
        }

        /*
         * Fill in the customer details to update
         */
        var product_details = {
            name: { 'S': name },
            description: { 'S': description },
            price: { 'S': price },
            unit: { 'S': unit },
            inventory: { 'S': inventory},
            uuid: {'S': uuid},
            accountId: { 'S': account_id }
        }

        var put_request = {
            Item: product_details
        }

        var list_items = {
            PutRequest: put_request
        }

        product_list.push(list_items);

        if (idx == products.length - 1) {
            batchWrite(product_list, true, res);
        }

        if (product_list.size == DYNAMODB_BATCH_WRITE_LIMIT) {
            batchWrite(product_list, false, res);
            product_list = [];
        }

    }
});

router.delete("/:accountid/:uuid", function (req, res) {
    var account_id = req.params.accountid;
    var uuid = req.params.uuid;

    if (utils.validateAccountIds(account_id) != true) {
        res.status(400).send("Invalid account id");
        return;
    }

    if (uuid == null || uuid == undefined) {
        res.status(400).send("Invalid uuid");
        return;
    }

    /*
     * Fill in the customer details to update
     */
    var product_details = {
        uuid: {'S': uuid},
        accountId: { 'S': account_id }
    }

    var delete_request = {
        Key: product_details
    }

    var list_items = {
        DeleteRequest: delete_request
    }

    batchWrite([list_items], true, res);
});

module.exports = router;

// Functions
function fetchProducts(accountId, prevResult, resp_data, res, brief) {

    var attributes = [];
    if (brief) {
        attributes = ['name', 'price']
    } else {
        attributes = ['name', 'price', 'uuid', 'description', 'unit', 'inventory']
    }

    var params = {
        TableName: DYNAMODB_PRODUCTS_TABLE_NAME,
        AttributesToGet: attributes,
        KeyConditions: {
            'accountId': {
                ComparisonOperator: 'EQ',
                AttributeValueList: [
                    {
                        S: accountId
                    }
                ]
            }
        },
        ScanIndexForward: true,
        Select: 'SPECIFIC_ATTRIBUTES'
    };

    if (prevResult != null && prevResult['LastEvaluatedKey'] != null) {
        params['ExclusiveStartKey'] = prevResult['LastEvaluatedKey'];
    }

    dynamodb.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).send(err);
            return;
        }
        else {
            if (data != null && data.Items != null) {
                for (var idx in data.Items) {
                    resp_data.push(utils.parseDDBJson(data.Items[idx]))
                }
            }

            if (data.LastEvaluatedKey == null) {
                res.status(200).send(resp_data);
                return;
            } else {
                fetchProducts(accountId, data, resp_data, res, brief)
            }
        }
    });
}


function batchWrite(product_list, complete, res) {
    var params = {};
    params['RequestItems'] = {};
    params.RequestItems[DYNAMODB_PRODUCTS_TABLE_NAME] = product_list;

    dynamodb.batchWriteItem(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).send(err.message);
            return;
        } else {
            if (complete) {
                res.status(200).send();
                return;
            }
        }
    });
}