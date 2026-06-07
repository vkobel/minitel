import {
  AdaIcon,
  CosmosIcon,
  CronosIcon,
  DotIcon,
  DydxIcon,
  EthereumIcon,
  FetchIcon,
  InjectiveIcon,
  KavaIcon,
  KsmIcon,
  NearIcon,
  OmIcon,
  OsmosisIcon,
  SeiIcon,
  SolanaIcon,
  SuiIcon,
  TiaIcon,
  TonIcon,
  TrxIcon,
  XtzIcon,
  ZetaIcon,
} from '@protocols/ui';

type CosmosToken = 'ATOM' | 'TIA' | 'ZETA' | 'OSMO' | 'DYDX' | 'FET' | 'INJ' | 'KAVA' | 'OM' | 'CRO' | 'SEI';

export type Token = CosmosToken | 'ETH' | 'NEAR' | 'SOL' | 'ADA' | 'SUI' | 'XTZ' | 'TON' | 'TRX' | 'DOT' | 'KSM';

export type Protocol = {
  token: Token;
  name: string;
  shortName?: string;
  icon?: React.ReactNode;
  url: string;
  localUrl: string;
  slug: string;
};

export const ETH = {
  token: 'ETH',
  name: 'Ethereum',
  icon: <EthereumIcon className="size-5" />,
  url: 'https://eth.minitel.app',
  localUrl: 'http://localhost:3000',
  slug: 'ethereum',
} satisfies Protocol;

export const SOL = {
  token: 'SOL',
  name: 'Solana',
  icon: <SolanaIcon className="size-5" />,
  url: 'https://sol.minitel.app',
  localUrl: 'http://localhost:3001',
  slug: 'solana',
} satisfies Protocol;

export const ATOM = {
  token: 'ATOM',
  name: 'Cosmos',
  icon: <CosmosIcon className="size-5" />,
  url: 'https://atom.minitel.app',
  localUrl: 'http://localhost:3002',
  slug: 'atom',
} satisfies Protocol;

export const NEAR = {
  token: 'NEAR',
  name: 'Near',
  icon: <NearIcon className="size-5" />,
  url: 'https://near.minitel.app',
  localUrl: 'http://localhost:3003',
  slug: 'near',
} satisfies Protocol;

export const CRO = {
  token: 'CRO',
  name: 'Cronos',
  icon: <CronosIcon className="size-5" />,
  url: 'https://cro.minitel.app',
  localUrl: 'http://localhost:3004',
  slug: 'cronos',
} satisfies Protocol;

export const SEI = {
  token: 'SEI',
  name: 'Sei',
  icon: <SeiIcon className="size-5" />,
  url: 'https://sei.minitel.app',
  localUrl: 'http://localhost:3005',
  slug: 'sei',
} satisfies Protocol;

export const ZETA = {
  token: 'ZETA',
  name: 'Zeta',
  icon: <ZetaIcon className="size-5" />,
  url: 'https://zeta.minitel.app',
  localUrl: 'http://localhost:3006',
  slug: 'zeta',
} satisfies Protocol;

export const DYDX = {
  token: 'DYDX',
  name: 'dYdX',
  icon: <DydxIcon className="size-5" />,
  url: 'https://dydx.minitel.app',
  localUrl: 'http://localhost:3007',
  slug: 'dydx',
} satisfies Protocol;

export const FET = {
  token: 'FET',
  name: 'Fetch',
  icon: <FetchIcon className="size-5" />,
  url: 'https://fet.minitel.app',
  localUrl: 'http://localhost:3008',
  slug: 'fetch',
} satisfies Protocol;

export const INJ = {
  token: 'INJ',
  name: 'Injective',
  icon: <InjectiveIcon className="size-5" />,
  url: 'https://inj.minitel.app',
  localUrl: 'http://localhost:3009',
  slug: 'injective',
} satisfies Protocol;

export const KAVA = {
  token: 'KAVA',
  name: 'Kava',
  icon: <KavaIcon className="size-5" />,
  url: 'https://kava.minitel.app',
  localUrl: 'http://localhost:3010',
  slug: 'kava',
} satisfies Protocol;

export const OM = {
  token: 'OM',
  name: 'Mantra',
  icon: <OmIcon className="size-5" />,
  url: 'https://om.minitel.app',
  localUrl: 'http://localhost:3011',
  slug: 'mantra',
} satisfies Protocol;

export const TIA = {
  token: 'TIA',
  name: 'Celestia',
  icon: <TiaIcon className="size-5" />,
  url: 'https://tia.minitel.app',
  localUrl: 'http://localhost:3012',
  slug: 'tia',
} satisfies Protocol;

export const OSMO = {
  token: 'OSMO',
  name: 'Osmosis',
  icon: <OsmosisIcon className="size-5" />,
  url: 'https://osmo.minitel.app',
  localUrl: 'http://localhost:3013',
  slug: 'osmosis',
} satisfies Protocol;

export const ADA = {
  token: 'ADA',
  name: 'Cardano',
  icon: <AdaIcon className="size-5" />,
  url: 'https://ada.minitel.app',
  localUrl: 'http://localhost:3014',
  slug: 'ada',
} satisfies Protocol;

export const TON = {
  token: 'TON',
  name: 'The Open Network',
  shortName: 'Ton',
  icon: <TonIcon className="size-5" />,
  url: 'https://ton.minitel.app',
  localUrl: 'http://localhost:3017',
  slug: 'ton',
} satisfies Protocol;

export const TRX = {
  token: 'TRX',
  name: 'Tron',
  icon: <TrxIcon className="size-5" />,
  url: 'https://trx.minitel.app',
  localUrl: 'http://localhost:3018',
  slug: 'trx',
} satisfies Protocol;

export const SUI = {
  token: 'SUI',
  name: 'Sui',
  icon: <SuiIcon className="size-5" />,
  url: 'https://sui.minitel.app',
  localUrl: 'http://localhost:3015',
  slug: 'sui',
} satisfies Protocol;

export const XTZ = {
  token: 'XTZ',
  name: 'Tezos',
  icon: <XtzIcon className="size-5" />,
  url: 'https://xtz.minitel.app',
  localUrl: 'http://localhost:3016',
  slug: 'xtz',
} satisfies Protocol;

export const DOT = {
  token: 'DOT',
  name: 'Polkadot',
  icon: <DotIcon className="size-5" />,
  url: 'https://dot.minitel.app',
  localUrl: 'http://localhost:3019',
  slug: 'dot',
} satisfies Protocol;

export const KSM = {
  token: 'KSM',
  name: 'Kusama',
  icon: <KsmIcon className="size-5" />,
  url: 'https://ksm.minitel.app',
  localUrl: 'http://localhost:3020',
  slug: 'ksm',
} satisfies Protocol;

export const PROTOCOLS: Protocol[] = [
  ETH,
  SOL,
  ATOM,
  NEAR,
  CRO,
  SEI,
  ZETA,
  DYDX,
  FET,
  INJ,
  KAVA,
  OM,
  TIA,
  OSMO,
  ADA,
  SUI,
  XTZ,
  TON,
  TRX,
  DOT,
  KSM,
];

export const getCurrentProtocol = () => {
  const currentOrigin = window.location.origin;
  const baseSlug = import.meta.env.BASE_URL.replace(/\//g, '');
  const currentProtocol = PROTOCOLS.find(
    (protocol) =>
      protocol.url === currentOrigin ||
      protocol.localUrl === currentOrigin ||
      (baseSlug !== '' && protocol.slug === baseSlug),
  );
  if (!currentProtocol) {
    throw new Error('Current protocol is not defined');
  }
  return currentProtocol;
};
