var express = require('express');
var router = express.Router();
var Firebase = require("firebase");
var firebase_ref = new Firebase(process.env.FIREBASE_URL);

//Authenticate Firebase
var firebase_secret = process.env.FIREBASE_SECRET;
firebase_ref.authWithCustomToken(firebase_secret, function(error, authData) {
    if (error) {
        console.log("Login Failed!", error);
    } else {
        console.log("Firebase authenticated successfully with payload.");
    }
});

//Cache firebase tokens - account mapping
var account_id_cache = {};
var account_id_ref = firebase_ref.child('/accountids');
account_id_ref.on('child_added', function(snapshot, prevChildKey) {
    var new_entry = snapshot;
    account_id_cache[new_entry.key()] = new_entry.val();
});

account_id_ref.on('child_changed', function(snapshot) {
    var changed_entry = snapshot;
    account_id_cache[changed_entry.key()] = changed_entry.val();
});

account_id_ref.on('child_removed', function(snapshot) {
    var removed_entry = snapshot;
    delete account_id_cache[removed_entry.key()];
});

//Cache firebase account - trackyourorder mapping
var account_trackyourorder_cache = {};

module.exports = {
    getAccountIds: function(){
        return account_id_cache;
    },

    validateAccountIds: function(account_id) {
        if (account_id == null || account_id == undefined) {
            return false;
        }

        if (account_id_cache[account_id] != null) {
            return true;
        } else {
            return false;
        }
    },

    getAccountTrackyourorder : function(account_id) {
        return account_trackyourorder_cache[account_id];
    },

    setAccountTrackyourorder : function(account_id, trackyourorder) {
        return account_trackyourorder_cache[account_id] = trackyourorder;
    },

    parseDDBJson: function (DDBJson) {
        var parsedJson = {};
        for (var keys in DDBJson) {
            var DDBValue = DDBJson[keys];
            var value = null;
            var name = Object.keys(DDBValue)[0]
            switch(name) {
                case 'S':
                    value = DDBValue[name];
                    break;
                case 'N':
                    value = parseInt(DDBValue[name]);
                    break;
                default:
                    value = DDBValue[name];
            }
            parsedJson[keys] = value;
        }
        return parsedJson;
    }
}
