Island Car Finder - Project Roadmap

Rule: This is the single source of truth for the project.
We do not rewrite this roadmap. We only tick off completed work or add new tasks when required.


✅ Completed
Public Website


Public Website

[x] Landing page
[x] Cars page
[x] Car details page
[x] Garages page
[x] Garage details page
[x] For Garages page refreshed for garage account applications
[x] Buyer page headers simplified to Home / Cars / Garages
[x] Garage login removed from buyer-facing headers
[x] Check For Garages page has clear approved garage login link
[x] Public page headers standardised across main pages
[x] Real mobile check completed across public pages


[x] Supabase migration
[x] Authentication enabled
[x] Photo uploads (Cloudinary)

Authentication


[x] Garage login
[x] Protected garage dashboard
[x] Logout
[x] garage_users table created
[x] First garage account linked (SC Motors)
[x] GET /me authentication flow
[x] Dashboard automatically loads logged-in garage
[x] Garage application form creates Supabase Auth user
[x] Garage applications saved as pending
[x] Pending garages blocked from dashboard
[x] Approved garages can access dashboard
[x] Admin can approve garage applications
[x] Admin can reject garage applications
[x] Approved garage is automatically linked to a garage account


Garage Dashboard

[x] Add car
[x] Edit existing cars
[x] Delete cars
[x] Upload multiple photos
[x] Current photo preview while editing
[x] Cancel edit mode
[x] Sold vehicles
[x] Reserved vehicles
[x] Status management
[x] Mileage parsing fixed
[x] Garage names displayed instead of UUIDs
[x] Garage profile management

Dashboard Cleanup

[x] Garage ID removed from Add Car
[x] Admin Key removed from Add Car
[x] Delete car uses authentication
[x] Reserve car uses authentication
[x] Mark sold uses authentication
[x] Photo upload uses authentication


Garage Profile & Features

[x] Garage Profile page
[x] Load existing profile
[x] Save profile changes
[x] Public garage profile page
[x] Edit cars
[x] Delete cars
[x] Upload multiple photos
[x] Save garage profile
[x] Better image handling


🚧 Current Sprint

Garage / Dashboard Improvements

[ ] Premium Add/Edit Car redesign
[ ] Premium dashboard UI
[x] Polish My Cars section
[x] Mobile optimisation
[x] Upload garage logo
[x] Upload garage banner
[x] Opening hours
[x] Improve public garage profile design


🔜 Next Sprint
Dashboard Improvements


[x] Reserved vehicle styling
[x] Sold vehicle styling
[ ] Disable enquiries on sold/reserved cars
[x] Add “View advert” button after editing a car


## Legal / Trust


[x] Privacy Policy page
[x] Terms page
[x] Cookie Policy page
[x] Homepage footer legal links
[x] Cookie consent banner

Authentication Polish


[x] Remove old garage dashboard admin-key flow
[x] Verify no old `adminKey` references remain in public/dashboard code
[x] Keep temporary `ADMIN_KEY` only for private admin routes
[x] Keep garage login/apply journey inside For Garages page
[x] Redirect logged-in garages directly to Dashboard
[ ] Later replace `ADMIN_KEY` with proper admin login
[x] Improve Garage Login page design

🚀 Launch Checklist

Accounts

[x] Garage signup application flow
[x] Garage approval
[x] Full garage onboarding flow tested
[ ] Email confirmation
[x] Password reset

Garage Features


[x] Garage logo
[x] Garage banner
[x] Opening hours
[ ] Dealer branding

Customer Features

[x] Search improvements
[x] Advanced filters
[ ] Saved cars
[x] Contact garage
[ ] Enquiry forms

Admin

[x] Review garage applications
[x] Approve garages
[x] Reject garages
[ ] Admin dashboard
[ ] Manage garages

Payments

[ ] Subscription plans
[ ] Stripe integration
[ ] Free trial
[ ] Billing portal
[ ] Trial expiry reminders

Launch Strategy

[ ] Switch SEO robots tags from noindex/nofollow to index/follow at launch
[x] Offer 3-month free trial for early garages
[ ] Onboard first garages manually
[ ] Help garages upload first listings
[ ] Collect feedback from garages
[ ] Convert free trial garages to paid subscribers
[x] Upgrade Render service to paid Starter plan before showing garages
[x] Connect iowcarfinder.co.uk domain
[x] Redirect iowcarfinder.com to iowcarfinder.co.uk


Polish

[x] Performance
[ ] SEO
[x] Error pages
[x] Terms & Privacy Policy
[x] Cookie Policy
[x] Analytics
[ ] Move public pages to one shared master header file
[x] Review mobile back-to-top / floating scroll button behaviour


🎉 Version 1.0

[ ] First live garage registered
[ ] First 100 cars listed
[ ] First paying subscriber
[ ] Public launch


📜 Project Rules

This roadmap is never rewritten.
Completed work gets ticked off.
New features are only added if genuinely required.
We finish the current sprint before moving to unrelated features where practical.
Every major feature is committed to Git before starting the next.


🎯 Launch Goal
Create the Isle of Wight's best dedicated used car website, where approved local garages can securely manage their stock, showcase their vehicles, and connect customers with trusted local garages through a fast, modern and professional platform.