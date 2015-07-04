module.exports = function(app){
    var location = require('./controllers/location');
    app.get('/api/location', location.send);
}