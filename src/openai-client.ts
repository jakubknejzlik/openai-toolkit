import OpenAI, { ClientOptions } from 'openai';

export const createOpenAIClient = (opts:ClientOptions={}): OpenAI => {
  return new OpenAI(opts);
};

let _defaultOpenAIClient: OpenAI = undefined
export const getDefaultOpenAIClient = (): OpenAI => {
  if(!_defaultOpenAIClient) {
    _defaultOpenAIClient=createOpenAIClient()
  }
  return _defaultOpenAIClient
}