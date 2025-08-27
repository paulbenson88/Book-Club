```markdown
// filepath: c:\Users\Paul\book-club\docs\issues\feat-picture-gallery.md
# Feature: Picture gallery and optional upload

Summary
Add a gallery page showing all pictures and optionally allow members to upload photos (admin approval flow optional).

User story
As a member, I want to view pictures from past meetings and upload my own so the group can share memories.

Acceptance criteria
- New page `/pictures` lists thumbnails with lightbox view
- Admin can enable/disable uploads
- Uploads validated (file type, size) and stored (Google Drive, S3, or repo mock)
- Optional: admin approval before visible

Notes
- Start with serverless/mock upload (no backend) and store references in Google Sheets or JSON
Priority: medium
Estimate: medium
```

