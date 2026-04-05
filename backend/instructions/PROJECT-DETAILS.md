We are building a project health monitoring webapp for CTO or PM or managers at that level , where we can add github repo link, track the necessary github metrics  and data, calculate risk score from those metrics and show it to th eCTO in a single dashboard with simple and easy view. In future we have to add many tools with that github project. Like we have to injest data from jira, sonarqube, jenkins for management data, code quality data and ci/cd data. From these datas we will score the project health. We might need to sync all projects every 6 hours. This is not immediate health tracking software, rather a indicator type software for team leads to see how is his projects and teams going in the long run. For MVP we will implement adding a github repos and Jira account to ingest necessary metrics from it and calcaulte the Risks.


4 Connector tools category
1. Code Repository: Github, Gitlab, Bitbucket
2. Project Management: Jira, Trello, Asana
3. CI/CD: Jenkins, CircleCI, TravisCI
4. Code Quality: SonarQube, CodeClimate, Codacy


ARCHITECTURE:
For our MVP the core part is when uses click sync in a project's UI. It creates a POST request with project id and connector tools names to the backend. The backend will have a queue system to handle these sync requests. We can use BullMQ for this. Each sync request will be added to the queue and processed asynchronously. The worker will then use the respective connector interface in libs dir. Once the data is fetched, it will be stored in our database and the risk score will be calculated based on the defined algorithm. Risk score will be saved to the databaset oo. Finally, the updated project health status will be sent back to the frontend to update the dashboard. We will use SSE here for updates in the UI. Like when when sync button is clicked it will show syncing. when each tools is synced it will show the status of that tool and when all tools are synced it will show sync complete in the UI. Then the necessary data will be refeched.
