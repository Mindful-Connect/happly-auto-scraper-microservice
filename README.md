# Opportunity Auto Scraper Microservice
In a single sentence: Scrapes funding opportunities given valid URL(s).

It is used to scrape using ChatGPT and store the extracted information in a MongoDB database and to provide
an API to the admin portal to fetch the scraped funding opportunities.

## Definitions

> **Core API**: Happly API.  
**This microservice** / **Auto Scraper** / **software**: The current microservice (the current codebase).  
**Admin Portal**: The admin portal that is used to manage the opportunities (aka. funding-scraper repository).

## How it works
Currently, there are two main features in this microservice:

## Scraping the funding opportunities from the given URL(s)
Auto Scraper Microservice is used for scraping the funding opportunities from the given URL(s). When given a URL or a sets of
URLs, it will start scraping and extracting information from those webpages.

The software can process multiple URLs simultaneously. However, it has a limit of 10 URLs at a time, which is hard-coded
in `src/auto-scraper/libraries/extractionProcessManager.lib.ts:69`. This is to prevent
the ChatGPT API from rate-limiting often. The software will queue the URLs and process them later when the current
processing URLs are done scraping.

📝 **Note:** After a process is done extracting, it will release the URL from the queue and start processing the next URL in the queue
(if there is any).

📝 **Note:** The software will also check if the URL is already in the database. If it is, it will overwrite the fields that are allowed
to be overwritten. If it is not, it will create a new entry in the database. The fields that are allowed to be overwritten are
hard-coded here: `src/extracted-opportunity/schemas/extractedOpportunity.schema.ts:11`

### Scraping the relevant links
When the requested fields are not found in the webpage, the software will try to scrape the missing information from a 
different relevant webpage. For example, if the requested fields are `title`, `description`, `deadline`, `amount`, and
`link`, but the webpage only contains `title`, `description`, and `deadline`, the software will try to scrape the missing
information from the relevant link (found by ChatGPT) separately.

📝 **Note:** Microservice will only recurse to the relevant URLs _one level_ max. If the relevant link contains another relevant link,
it will be ignored and not scrape the relevant link from the relevant link since it is already a second level of recursion.

## Auto-Scraping the Expired Opportunities
There are some opportunities that are marked as expired, but they may have become available again (e.g.: the deadline was
extended). To make sure that the expired opportunities are up-to-date, the software will auto-scrape the expired opportunities
all the time. Since there are so many items to scrape, the microservice will continuously scrape 10s of items at a time and
automatically moves on to the next sets of items when the current sets of items are done scraping.

To auto-scrape the expired opportunities, the software will first fetch all the opportunities from the Admin Portal. Then, it will
iterate through all the opportunities and scrape the expired opportunities. The software will then save the latest status 
of the expired opportunities in the database.

The queueing for this feature is not the same as the one mentioned in the previous section. This feature does not hold items in-memory as
a queue list. Instead, it will query the database for the expired opportunities sorted by the `lastScrapedAt` field in ascending order to
make sure it scrapes every opportunity at least once and fairly. see `src/expired-opportunity/services/expiredOpportunity.service.ts:11`.

The Admin Portal then will fetch the latest status of the expired opportunities from this microservice and users can optionally
override the Admin Portal version with the latest from this microservice. (The only field that gets updated is the `application_deadline` field).

## How to Run the Microservice
### Prerequisites
- MongoDB (tested with: v1.8.0)
- NPM (tested with: v8.5.5)
- Node.js (tested with: v18.12.1)
- ChatGPT API key

### Steps
1. Clone the repository and `cd` into it.
```bash
git clone https://github.com/Mindful-Connect/happly-auto-scraper-microservice.git
cd happly-auto-scraper-microservice
```

2. Install the dependencies.
```bash
npm install
```

3. Create a `.env` file from `.env.example` in the root directory of the project and make sure
you fill in the following fields (**required**):
```dotenv
# Port to run the microservice's server on
PORT=8888

# Microservice Secrets
API_SECRET_KEY="api secret"

# MongoDB
MONGO_URI="<MongoDB URI>"

# OpenAI
OPENAI_API_KEY=""
OPENAI_ORG_ID=""

# Happly
HAPPLY_SYNC_TOKEN=
HAPPLY_SYNC_API=http://127.0.0.1:8000/api
```

4. Build and Run the Microservice.
```bash
# In Development
npm run start:dev

# In Production
npm run build
npm run start:prod
```

## TODO
- [x] add functionality to re-scrape every past existing opportunity and send to the portal to compare the results. 
- [x] plan for re-scraping the opportunities. (maybe add a button in the admin panel that says "re-scrape all" and then starts re-scraping everything again) 
- [x] mitigate the rate limit issue by backing off the requests exponentially.
- [ ] save all the logs in a file or something. (maybe use winston)
- [x] make sure the application link will be shown as full link if GPT sent a URI fragment.
- [x] extracting province abbreviation is not stable
- [x] deadline and open date are inconsistent when not found.
- [x] make sure not to add duplicates (test this)
- [x] add a few other fields (app_req, business_type_req, role_type_tags, role_length_tags, project_activities_tags, project_length_tags)
- [ ] Make sure all the fields are scraped correctly. (e.g.: min max revenue, min max company size)
- [ ] Add more inline comments in the code
- [ ] Add Support for PDFs
- [ ] Improve performance-related concerns. (memory safety, etc.)
  - [ ] Will need to do a memory profiling. 

## Tech Stacks
![img.png](docs/assets/tech-stacks.png)

