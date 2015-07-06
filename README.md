Stick API server

Before starting set below environment variables:

STICK_API_PORT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY


Send Location API:
GET /api/locations/{version}/{source_id}?data={content}&token={token}

Send Alert API:
GET /api/alerts/{version}/{source_id}/{alert_type}?data={content}&token={token}

Send Event API:
GET /api/events/{version}/{source_id}?data={content}&token={token}