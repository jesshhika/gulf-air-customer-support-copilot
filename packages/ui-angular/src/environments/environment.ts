export const environment = {
  production: true,
  apiLangChainJsServer: {
    label: 'Langchain.js',
    url: import.meta.env?.NG_API_URL_LANGCHAIN_JS ||
      'https://gulf-air-api-g8dfcka8cfd6e9b9.southindia-01.azurewebsites.net',
  },
  apiLlamaIndexTsServer: {
    label: 'LlamaIndex TS',
    url: import.meta.env?.NG_API_URL_LLAMAINDEX_TS || '',
  },
  apiMafPythonServer: {
    label: 'MAF Python',
    url: import.meta.env?.NG_API_URL_MAF_PYTHON || '',
  },
};
