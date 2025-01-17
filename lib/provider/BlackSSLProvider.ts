// istanbul ignore file

import Joi from 'joi';
import assert from 'assert';

import {
  BlackSSLProviderConfig,
  HttpsNodeConfig,
  NodeTypeEnum,
  SubscriptionUserinfo,
} from '../types';
import { ConfigCache } from '../utils/cache';
import httpClient from '../utils/http-client';
import Provider from './Provider';

export default class BlackSSLProvider extends Provider {
  public readonly username: string;
  public readonly password: string;

  constructor(name: string, config: BlackSSLProviderConfig) {
    super(name, config);

    const schema = Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
    }).unknown();

    const { error } = schema.validate(config);

    // istanbul ignore next
    if (error) {
      throw error;
    }

    this.username = config.username;
    this.password = config.password;
    this.supportGetSubscriptionUserInfo = true;
  }

  public async getSubscriptionUserInfo(): Promise<
    SubscriptionUserinfo | undefined
  > {
    const { subscriptionUserinfo } = await this.getBlackSSLConfig(
      this.username,
      this.password,
    );

    if (subscriptionUserinfo) {
      return subscriptionUserinfo;
    }
    return void 0;
  }

  public async getNodeList(): Promise<ReadonlyArray<HttpsNodeConfig>> {
    const { nodeList } = await this.getBlackSSLConfig(
      this.username,
      this.password,
    );
    return nodeList;
  }

  // istanbul ignore next
  private async getBlackSSLConfig(
    username: string,
    password: string,
  ): Promise<{
    readonly nodeList: ReadonlyArray<HttpsNodeConfig>;
    readonly subscriptionUserinfo?: SubscriptionUserinfo;
  }> {
    assert(username, '未指定 BlackSSL username.');
    assert(password, '未指定 BlackSSL password.');

    const key = `blackssl_${username}`;

    const response = ConfigCache.has(key)
      ? JSON.parse(ConfigCache.get(key) as string)
      : await (async () => {
          const res = await httpClient.get(
            'https://api.darkssl.com/v1/service/ssl_info',
            {
              searchParams: {
                username,
                password,
              },
              headers: {
                'user-agent':
                  'GoAgentX/774 CFNetwork/901.1 Darwin/17.6.0 (x86_64)',
              },
            },
          );

          ConfigCache.set(key, res.body);

          return JSON.parse(res.body);
        })();

    return {
      nodeList: (response.ssl_nodes as readonly any[]).map<HttpsNodeConfig>(
        (item) => ({
          nodeName: item.name,
          type: NodeTypeEnum.HTTPS,
          hostname: item.server,
          port: item.port,
          username,
          password,
        }),
      ),
      subscriptionUserinfo: {
        upload: 0,
        download: response.transfer_used,
        total: response.transfer_enable,
        expire: response.expired_at,
      },
    };
  }
}
