# Agent notes

This repository is the Next.js frontend for the contacts app.

- Frontend fork: https://github.com/ranadeepsingh/sf-frontend
- Backend fork: https://github.com/ranadeepsingh/sf-backend
- Default branch: `trunk`
- Checks: `npm test -- --runInBand`, `npm run typecheck`, `npm run lint`, and `npm run build`

Contact fields use the JSON contacts API. Photos use the separate
`PUT /api/v1/contacts/{id}/photo` multipart endpoint with a `file` part. Read
photos through the frontend proxy at `/api/contacts/{id}/photo`.

For Qodo, use `/review` for a review and `/improve` for improvement suggestions.
Ask questions in normal comments that mention `qodo`. Do not use `/ask`.
