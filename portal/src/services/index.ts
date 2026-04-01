/**
 * ============================================================================
 * SERVICES INDEX
 * ============================================================================
 * Exporta todos os serviços do sistema
 */

// SOAP Client
export { 
  SoapClient, 
  createSoapClient, 
  getDefaultSoapClient,
  WEBSERVICE_CONFIG,
  ABRASF_CONFIG,
  type SoapResponse,
  type Ambiente,
} from './soap-client';

// XML Builder
export { 
  XmlBuilder,
  type Prestador,
  type Tomador,
  type Servico,
  type Rps,
  type DadosNfse,
} from './xml-builder';

// XML Signer
export {
  XmlSigner,
  encryptCertificateData,
  decryptCertificateData,
  encryptPassword,
  decryptPassword,
  type CertificateInfo,
  type SignedXml,
} from './xml-signer';

// NFSe Service
export {
  NfseService,
  createNfseService,
  type EmissaoInput,
  type EmissaoResult,
  type CancelamentoInput,
} from './nfse-service';

// License Service
export {
  LicenseService,
  getLicenseService,
  type LicenseStatus,
  type GoogleSheetsConfig,
} from './license-service';
