# Enterprise RAG for Atlassian Confluence & Jira

This project contains a Forge app written in Javascript that can be deployed into Confluence & Jira spaces.

See [developer.atlassian.com/platform/forge/](https://developer.atlassian.com/platform/forge) for documentation and tutorials explaining Forge.

## Requirements

See [Set up Forge](https://developer.atlassian.com/platform/forge/set-up-forge/) for instructions to get set up.

## Quick start
- Install top-level dependencies:
```
npm install
```

- Install dependencies inside of the `static/assertive-mode` directory:
```
npm install
```

- Modify your app by editing the files in `static/assertive-mode/src/`.

- Build your app (inside of the `static/assertive-mode` directory):
```
npm run build
```

- Deploy your app by running:
```
forge deploy
```

- Install your app in an Atlassian site by running:
```
forge install
```

### Notes
- Use the `forge deploy` command when you want to persist code changes.
- Use the `forge install` command when you want to install the app on a new site.
- Once the app is installed on a site, the site picks up the new app changes you deploy without needing to rerun the install command.
