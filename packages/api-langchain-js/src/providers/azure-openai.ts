import { AzureChatOpenAI } from "@langchain/openai";
import {
  DefaultAzureCredential,
  getBearerTokenProvider,
  ManagedIdentityCredential,
} from "@azure/identity";

const AZURE_COGNITIVE_SERVICES_SCOPE =
  "https://cognitiveservices.azure.com/.default";

export const llm = async () => {
  console.log("Using Azure OpenAI");

  const isRunningInLocalDocker =
    process.env.IS_LOCAL_DOCKER_ENV === "true";

  console.log(
    "Azure Endpoint:",
    process.env.AZURE_OPENAI_ENDPOINT
  );

  console.log(
    "Azure Deployment:",
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME
  );

  console.log(
    "Azure API Version:",
    process.env.AZURE_OPENAI_API_VERSION
  );

  if (isRunningInLocalDocker) {
    console.log(
      "Running in local Docker environment, using Azure OpenAI API Key authentication."
    );

    return new AzureChatOpenAI({
      azureOpenAIApiKey:
        process.env.AZURE_OPENAI_API_KEY,

      azureOpenAIApiDeploymentName:
        process.env.AZURE_OPENAI_DEPLOYMENT_NAME,

      azureOpenAIApiVersion:
        process.env.AZURE_OPENAI_API_VERSION,

      azureOpenAIEndpoint:
        process.env.AZURE_OPENAI_ENDPOINT,

      temperature: 0,
      streaming: true,
    });
  }

  let credential: any = new DefaultAzureCredential();

  const clientId = process.env.AZURE_CLIENT_ID;

  if (clientId) {
    console.log("Using Azure Client ID:", clientId);

    credential = new ManagedIdentityCredential({
      clientId,
    });
  }

  const azureADTokenProvider =
    getBearerTokenProvider(
      credential,
      AZURE_COGNITIVE_SERVICES_SCOPE
    );

  console.log(
    "Using Azure Managed Identity authentication."
  );

  return new AzureChatOpenAI({
    azureADTokenProvider,

    azureOpenAIEndpoint:
      process.env.AZURE_OPENAI_ENDPOINT,

    azureOpenAIApiDeploymentName:
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME,

    azureOpenAIApiVersion:
      process.env.AZURE_OPENAI_API_VERSION,

    temperature: 0,
    streaming: true,
  });
};