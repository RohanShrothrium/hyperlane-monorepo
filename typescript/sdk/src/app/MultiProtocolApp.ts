import { PublicKey } from '@solana/web3.js';
import debug from 'debug';

import { ProtocolType, objMap, promiseObjAll } from '@hyperlane-xyz/utils';

import { ChainMetadata } from '../metadata/chainMetadataTypes';
import { MultiProtocolProvider } from '../providers/MultiProtocolProvider';
import { ChainMap, ChainName } from '../types';
import { MultiGeneric } from '../utils/MultiGeneric';

/**
 * A minimal interface for an adapter that can be used with MultiProtocolApp
 * The purpose of adapters is to implement protocol-specific functionality
 * E.g. EvmRouterAdapter implements EVM-specific router functionality
 *   whereas SealevelRouterAdapter implements the same logic for Solana
 */
export abstract class BaseAppAdapter<ContractAddrs = {}> {
  public abstract readonly protocol: ProtocolType;
  constructor(
    public readonly multiProvider: MultiProtocolProvider<ContractAddrs>,
    public readonly logger = debug(`hyperlane:AppAdapter`),
  ) {}
}

export type AdapterClassType<ContractAddrs = {}, API = {}> = new (
  multiProvider: MultiProtocolProvider<ContractAddrs>,
) => API;

export class BaseEvmAdapter<
  ContractAddrs = {},
> extends BaseAppAdapter<ContractAddrs> {
  public readonly protocol: ProtocolType = ProtocolType.Ethereum;
}

export class BaseSealevelAdapter<
  ContractAddrs = {},
> extends BaseAppAdapter<ContractAddrs> {
  public readonly protocol: ProtocolType = ProtocolType.Sealevel;

  static derivePda(
    seeds: Array<string | Buffer>,
    programId: string | PublicKey,
  ): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      seeds.map((s) => Buffer.from(s)),
      new PublicKey(programId),
    );
    return pda;
  }
}

/**
 * A version of HyperlaneApp that can support different
 * provider types across different protocol types.
 *
 * Intentionally minimal as it's meant to be extended.
 * Extend this class as needed to add useful methods/properties.
 *
 * @typeParam ContractAddrs - A map of contract names to addresses
 * @typeParam IAdapterApi - The type of the adapters for implementing the app's
 *   functionality across different protocols.
 *
 * @param multiProvider - A MultiProtocolProvider instance that MUST include the app's
 *   contract addresses in its chain metadata
 * @param logger - A logger instance
 *
 * @override protocolToAdapter - This should return an Adapter class for a given protocol type
 */
export abstract class MultiProtocolApp<
  ContractAddrs = {},
  IAdapterApi extends BaseAppAdapter = BaseAppAdapter,
> extends MultiGeneric<ChainMetadata<ContractAddrs>> {
  constructor(
    public readonly multiProvider: MultiProtocolProvider<ContractAddrs>,
    public readonly logger = debug('hyperlane:MultiProtocolApp'),
  ) {
    super(multiProvider.metadata);
  }

  // Subclasses should override this with more specific adapters
  abstract protocolToAdapter(
    protocol: ProtocolType,
  ): AdapterClassType<ContractAddrs, IAdapterApi>;

  metadata(chain: ChainName): ChainMetadata<ContractAddrs> {
    return this.get(chain);
  }

  adapter(chain: ChainName): IAdapterApi {
    const metadata = this.metadata(chain);
    const Adapter = this.protocolToAdapter(metadata.protocol);
    if (!Adapter)
      throw new Error(`No adapter for protocol ${metadata.protocol}`);
    return new Adapter(this.multiProvider);
  }

  adapters(): ChainMap<IAdapterApi> {
    return this.map((chain, _) => this.adapter(chain));
  }

  adapterMap<Output>(
    fn: (n: ChainName, a: IAdapterApi) => Promise<Output>,
  ): Promise<ChainMap<Output>> {
    return promiseObjAll(objMap(this.adapters(), fn));
  }
}
