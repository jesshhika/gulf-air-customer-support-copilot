# AI Travel Agents UI

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.0.4.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Gulf Air support workspace

The UI opens with a local demo sign-in. Choose one of the sample passenger profiles, sign in with a sample email, or create a browser-local demo profile. The workspace keeps passenger context separate when switching profiles and offers English/Arabic UI and response-language selection.

The desktop workspace is arranged as passenger context, conversation, and copilot suggestions. Conversation history scrolls within its panel so the support context stays visible at 100% zoom. “Book flight” searches sample schedules and creates a local demo booking reference only.

> [!IMPORTANT]
> Demo sign-in is not authentication. Sample fares and bookings are not live Gulf Air inventory; no ticket, payment, CRM update, or human-agent transfer is performed. Do not enter payment or passport details.

## Building

### Development Build

Before building the project, ensure that you have the necessary environment variables set up. The `NG_API_URL` variable is required for the application to function correctly. You can set this in a `.env.development` file in this folder:

```bash
NG_API_URL=http://localhost:4000
```

To build the project run (for development):

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

### Docker compose build
If you are running the project using Docker, if you need to point the `NG_API_URL` to the API service running in Docker, you can set the environment variable in the `.env.docker` file:

```bash
NG_API_URL=http://web-api:4000 # Assuming 'web-api' is the name of your API service in Docker Compose
```

Then, you can build the Docker image by running:

```bash
npm run build:docker
```


### Production Build

To build the project for production, you need to first ensure that you have provided the NG_API_URL environment variable. This is done in the `.env.production` file:

```bash
NG_API_URL=https://api.production.example.com
```

After setting the environment variable, you can build the project for production by running:
```bash
npm run build:production
```

This command will create an optimized build of your application, suitable for deployment. The output will also be placed in the `dist/` directory. The NG_API_URL will be replaced with the value from the `.env.production` file during the build process.

> [!NOTE]
> When deploying to production on Azure using `azd`, the `NG_API_URL` will be automatically set to the correct after the `api` service is deployed. You do not need to manually set it in the `.env.production` file in that case, it will be created for you.
> See `azure.yaml` in the root of the project for more details on how the deployment works.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
