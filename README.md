# GACS Guidance Portal: demo site

A self-contained static site. `index.html` holds everything, including the logo, so you can host it anywhere.

## Run it
- On your computer: double-click `start.bat` (opens http://localhost:8080), or just open `index.html`.
- For colleagues on your network: double-click `start-network.bat` and share the address it prints.
- For external audiences on a public link: upload the folder to any static host, or deploy this branch on Vercel (below).
  - Netlify Drop (app.netlify.com/drop): drag the `gacs-demo` folder onto the page and you get a public link.
  - GitHub Pages, Cloudflare Pages, or your own web server: publish `index.html` as the site root.

## Demo accounts
ADMIN-0001 (admin) and GACS-1001 to GACS-1005 (members; 1003, 1004 and 1005 are also Guides).
Use "Reset demo data" in the admin console to start over.

## Walkthrough
1. Log in with an unknown ID: access denied. Request membership (name, email and mobile number), then approve it as ADMIN-0001 to get a member ID.
2. As any member: Ask for guidance, pick one of the four categories, submit. It is matched to a Guide in that category (never yourself).
3. As any member: open "Become a Guide", write a short profile, choose one to four categories, and you also get a Guide inbox.
4. As a Guide: attend a query. A simulated Zoom session is generated. Join, then mark the discussion complete.
5. As the Seeker: give a 1 to 5 rating and feedback. It appears on the Guide's profile and reviews.

## Good to know
- Data lives in each visitor's own browser (localStorage), so every visitor sees their own copy of the sample data and changes are not shared between people. A shared demo needs a small backend; ask if you want one.
- The mobile number collected at membership request is visible only in the admin console. Zoom links and resume uploads are simulated. There is no real authentication.
- Accessibility: keyboard operable (category cards, tabs, dialog), visible focus, skip link, screen-reader labels and live status messages.

## Hosting on Vercel
This branch is only the static site: no build step and no environment variables.
1. In Vercel choose **Add New > Project**, import the repository and select this branch (`feature/gacs-static-demo`) for the deployment. Keep the project's production branch as `main`, so this branch is deployed as a Preview and never replaces anything.
2. Framework preset: **Other**. Leave Build Command, Output Directory and Install Command empty. Root directory: the repository root.
3. Deploy. `index.html` is served at the root; `vercel.json` only adds a few security headers.

`gacs-portal-artifact.html` is the standalone single-file version of the same demo.
