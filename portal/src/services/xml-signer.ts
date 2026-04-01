/**
 * ============================================================================
 * XML SIGNER - ASSINATURA DIGITAL
 * ============================================================================
 * Assina XMLs com certificado digital A1 (arquivo .pfx)
 * Padrão XMLDSig (XML Digital Signature)
 */

import * as forge from 'node-forge';
import * as crypto from 'crypto';

// ===================
// TIPOS
// ===================

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  thumbprint: string;
}

export interface SignedXml {
  xml: string;
  certificateInfo: CertificateInfo;
}

// ===================
// CONSTANTES
// ===================

const SIGNATURE_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
const DIGEST_ALGORITHM = 'http://www.w3.org/2000/09/xmldsig#sha1';
const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const TRANSFORM_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// ===================
// XML SIGNER CLASS
// ===================

export class XmlSigner {
  private privateKey: forge.pki.PrivateKey;
  private certificate: forge.pki.Certificate;
  private certificateBase64: string;

  constructor(pfxBuffer: Buffer, password: string) {
    const { privateKey, certificate, certificateBase64 } = this.loadCertificate(pfxBuffer, password);
    this.privateKey = privateKey;
    this.certificate = certificate;
    this.certificateBase64 = certificateBase64;
  }

  /**
   * Carrega certificado do arquivo PFX
   */
  private loadCertificate(pfxBuffer: Buffer, password: string): {
    privateKey: forge.pki.PrivateKey;
    certificate: forge.pki.Certificate;
    certificateBase64: string;
  } {
    try {
      // Converte Buffer para formato base64/DER
      const pfxBase64 = pfxBuffer.toString('base64');
      const pfxDer = forge.util.decode64(pfxBase64);
      const pfxAsn1 = forge.asn1.fromDer(pfxDer);
      
      // Parse do PFX
      const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);
      
      // Extrai chave privada
      const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      
      if (!keyBag?.key) {
        throw new Error('Chave privada não encontrada no certificado');
      }
      
      const privateKey = keyBag.key as forge.pki.PrivateKey;
      
      // Extrai certificado
      const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      
      if (!certBag?.cert) {
        throw new Error('Certificado não encontrado');
      }
      
      const certificate = certBag.cert;
      
      // Converte certificado para Base64
      const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
      const certificateBase64 = forge.util.encode64(certDer);
      
      return { privateKey, certificate, certificateBase64 };
      
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Invalid password')) {
          throw new Error('Senha do certificado incorreta');
        }
        throw new Error(`Erro ao carregar certificado: ${error.message}`);
      }
      throw new Error('Erro desconhecido ao carregar certificado');
    }
  }

  /**
   * Obtém informações do certificado
   */
  getCertificateInfo(): CertificateInfo {
    const cert = this.certificate;
    
    // Extrai subject
    const subjectAttrs = cert.subject.attributes
      .map(attr => `${attr.shortName}=${attr.value}`)
      .join(', ');
    
    // Extrai issuer
    const issuerAttrs = cert.issuer.attributes
      .map(attr => `${attr.shortName}=${attr.value}`)
      .join(', ');
    
    // Calcula thumbprint (SHA1 do certificado DER)
    const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const thumbprint = forge.md.sha1.create().update(certDer).digest().toHex().toUpperCase();
    
    return {
      subject: subjectAttrs,
      issuer: issuerAttrs,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      serialNumber: cert.serialNumber,
      thumbprint,
    };
  }

  /**
   * Verifica se o certificado é válido
   */
  isValid(): boolean {
    const now = new Date();
    return now >= this.certificate.validity.notBefore && 
           now <= this.certificate.validity.notAfter;
  }

  /**
   * Assina um XML
   */
  sign(xml: string, idAttr: string = 'Id'): SignedXml {
    // Encontra o ID do elemento a ser assinado
    const idMatch = xml.match(new RegExp(`${idAttr}="([^"]+)"`));
    const referenceId = idMatch ? idMatch[1] : '';
    const referenceUri = referenceId ? `#${referenceId}` : '';

    // 1. Canonicaliza o XML (simplificado - remove espaços extras)
    const canonicalXml = this.canonicalize(xml);

    // 2. Calcula digest (SHA1) do conteúdo
    const digestValue = this.calculateDigest(canonicalXml);

    // 3. Monta SignedInfo
    const signedInfo = this.buildSignedInfo(referenceUri, digestValue);

    // 4. Canonicaliza SignedInfo
    const canonicalSignedInfo = this.canonicalize(signedInfo);

    // 5. Assina SignedInfo com a chave privada
    const signatureValue = this.calculateSignature(canonicalSignedInfo);

    // 6. Monta bloco Signature completo
    const signature = this.buildSignatureBlock(signedInfo, signatureValue);

    // 7. Insere assinatura no XML
    const signedXml = this.insertSignature(xml, signature);

    return {
      xml: signedXml,
      certificateInfo: this.getCertificateInfo(),
    };
  }

  /**
   * Canonicaliza XML (C14N simplificado)
   */
  private canonicalize(xml: string): string {
    return xml
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/>\s+</g, '><')
      .trim();
  }

  /**
   * Calcula digest SHA1
   */
  private calculateDigest(content: string): string {
    const md = forge.md.sha1.create();
    md.update(content, 'utf8');
    return forge.util.encode64(md.digest().bytes());
  }

  /**
   * Calcula assinatura RSA-SHA1
   */
  private calculateSignature(content: string): string {
    const md = forge.md.sha1.create();
    md.update(content, 'utf8');
    
    const signature = this.privateKey.sign(md);
    return forge.util.encode64(signature);
  }

  /**
   * Monta bloco SignedInfo
   */
  private buildSignedInfo(referenceUri: string, digestValue: string): string {
    return `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      `<CanonicalizationMethod Algorithm="${CANONICALIZATION_ALGORITHM}"/>` +
      `<SignatureMethod Algorithm="${SIGNATURE_ALGORITHM}"/>` +
      `<Reference URI="${referenceUri}">` +
      `<Transforms>` +
      `<Transform Algorithm="${TRANSFORM_ENVELOPED}"/>` +
      `<Transform Algorithm="${CANONICALIZATION_ALGORITHM}"/>` +
      `</Transforms>` +
      `<DigestMethod Algorithm="${DIGEST_ALGORITHM}"/>` +
      `<DigestValue>${digestValue}</DigestValue>` +
      `</Reference>` +
      `</SignedInfo>`;
  }

  /**
   * Monta bloco Signature completo
   */
  private buildSignatureBlock(signedInfo: string, signatureValue: string): string {
    return `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      signedInfo +
      `<SignatureValue>${signatureValue}</SignatureValue>` +
      `<KeyInfo>` +
      `<X509Data>` +
      `<X509Certificate>${this.certificateBase64}</X509Certificate>` +
      `</X509Data>` +
      `</KeyInfo>` +
      `</Signature>`;
  }

  /**
   * Insere assinatura no XML
   */
  private insertSignature(xml: string, signature: string): string {
    // Procura tag de fechamento onde inserir a assinatura
    // Para NFSe, geralmente é antes do fechamento de InfDeclaracaoPrestacaoServico ou Rps
    
    const insertPoints = [
      '</InfDeclaracaoPrestacaoServico>',
      '</InfPedidoCancelamento>',
      '</Rps>',
    ];

    for (const point of insertPoints) {
      if (xml.includes(point)) {
        return xml.replace(point, signature + point);
      }
    }

    // Se não encontrar ponto específico, insere antes da última tag
    const lastTagMatch = xml.match(/<\/[^>]+>$/);
    if (lastTagMatch) {
      return xml.replace(lastTagMatch[0], signature + lastTagMatch[0]);
    }

    return xml + signature;
  }
}

// ===================
// FUNÇÕES AUXILIARES
// ===================

/**
 * Criptografa dados do certificado para armazenamento seguro
 */
export function encryptCertificateData(
  data: Buffer,
  encryptionKey: string
): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Descriptografa dados do certificado
 */
export function decryptCertificateData(
  encryptedBase64: string,
  ivBase64: string,
  encryptionKey: string
): Buffer {
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  
  const authTag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(0, -16);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

/**
 * Criptografa senha do certificado
 */
export function encryptPassword(
  password: string,
  encryptionKey: string
): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  const encrypted = Buffer.concat([
    iv,
    cipher.update(password, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  
  return encrypted.toString('base64');
}

/**
 * Descriptografa senha do certificado
 */
export function decryptPassword(
  encryptedBase64: string,
  encryptionKey: string
): string {
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const iv = encrypted.subarray(0, 16);
  const authTag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(16, -16);
  
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

export default XmlSigner;
