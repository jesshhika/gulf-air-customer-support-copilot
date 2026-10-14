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

  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deploymentName =
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME ??
    process.env.AZURE_OPENAI_DEPLOYMENT ??
    process.env.AZURE_AT_MODEL_DEPLOYMENT_NAME;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION ?? "2025-04-01-preview";

  if (!deploymentName) {
    throw new Error(
      "Azure OpenAI deployment is not configured. Set AZURE_OPENAI_DEPLOYMENT_NAME."
    );
  }

  if (apiKey) {
    console.log(
      "Using Azure OpenAI API key authentication."
    );

    return new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIApiDeploymentName: deploymentName,
      azureOpenAIApiVersion: apiVersion,
      azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
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
    azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
    azureOpenAIApiDeploymentName: deploymentName,
    azureOpenAIApiVersion: apiVersion,
    temperature: 0,
    streaming: true,
  });
};