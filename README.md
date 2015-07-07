Stick API server

===========================

Before starting set below environment variables:


STICK_API_PORT (default 3000)

AWS_ACCESS_KEY_ID

AWS_SECRET_ACCESS_KEY

FIREBASE_SECRET

=============================

Send Location API:

GET /api/locations/{version}/{source_id}?data={content}&token={token}

	version - Get info from the device, currently version = d1.

	source_id - Device ID.

	content - Raw location data sent by the device conforming to the version spec.

	token - authentication token.


Send Alert API:

GET /api/alerts/{version}/{source_id}/{alert_type}?data={content}&token={token}


Send Event API:

GET /api/events/{version}/{source_id}?data={content}&token={token}
