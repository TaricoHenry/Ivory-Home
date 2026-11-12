# Public API contract

The public site only talks to the backend through the endpoints named in
`_data/event.yml → backend.endpoints`, resolved against `backend.api_base`.
Any Firebase Functions backend that serves these shapes works with the template.

All requests send `credentials: "omit"`. Errors return a non-2xx status and
`{ "error": { "message": "Shown to the guest" } }`.

Bodies are sent exactly as below. The backends validate with Joi and
`allowUnknown: false`, so the front end never adds extra fields; the event is
identified by `api_base`, not by the body.

## Open RSVP (`features.rsvp: open`)

`POST {registrations}`

```json
{
  "name": "Jane Doe",
  "plusOne": true,
  "plusOneName": "John Doe",
  "items": [{ "foodItemId": "abc", "quantity": 1, "notes": "" }],
  "requestId": "uuid-v4, reused on retry for idempotency"
}
```

`plusOneName` is only sent when `plusOne` is true. `items` is empty when
contributions are off. Only attending guests submit; "No" is handled in the page.

## Personal RSVP (`features.rsvp: personal`)

Links look like `https://<site>/?token=ABC123`.

| Endpoint | Response |
|---|---|
| `GET {token_status}` | `{ "valid": true, "used": false }` |
| `GET {token_details}` | `{ "household": "The Smith Family", "members": [{ "memberId": "m1", "personalizedAddy": "Mr. John Smith", "rsvp": "yes" \| "no" \| null }] }` |
| `POST {token_reply}` | body `{ "responses": [{ "memberId": "m1", "rsvp": "yes" }] }` |

## Form RSVP (`features.rsvp: form`)

`POST {submissions}` with one key per entry in `rsvp.fields`, plus `requestId`:

```json
{ "name": "Jane Doe", "email": "jane@example.com", "whatsapp": "+592 600 0000",
  "timeslot": "2026-11-17T10:00:00-04:00", "requestId": "uuid-v4" }
```

Values are trimmed strings; a select sends the chosen option's `value`.
The backend's Joi schema must list exactly these keys.

## Contributions (`features.contributions: true`)

`GET {food_items}` → `{ "foodItems": [{ "id": "abc", "name": "Sorrel", "unit": "1 jug" }] }`

## Gallery (`features.gallery: true`)

| Endpoint | Response |
|---|---|
| `GET {gallery_photos}?limit=20&after=<cursor>` | `{ "photos": [{ "id", "thumbnailUrl", "width", "height" }], "nextCursor": "…" \| null }` |
| `GET {gallery_photos}/{id}` | `{ "displayUrl", "thumbnailUrl" }` |

Image URLs are short-lived signed Cloudflare URLs; the page re-requests a photo
when its thumbnail fails to load.
