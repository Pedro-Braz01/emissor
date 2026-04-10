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
  private privateKey: any;
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
   *
   * O processo segue o padrão XMLDSig (enveloped signature):
   * 1. Extrai o elemento referenciado pelo atributo Id
   * 2. Remove qualquer <Signature> existente do elemento (transform enveloped)
   * 3. Canonicaliza apenas o elemento referenciado
   * 4. Calcula digest SHA1 do elemento canonicalizado
   * 5. Monta SignedInfo com o digest
   * 6. Canonicaliza e assina SignedInfo com chave privada
   * 7. Insere bloco <Signature> no XML original
   */
  sign(xml: string, idAttr: string = 'Id'): SignedXml {
    // Encontra o ID do elemento a ser assinado
    const idMatch = xml.match(new RegExp(`${idAttr}="([^"]+)"`));
    const referenceId = idMatch ? idMatch[1] : '';
    const referenceUri = referenceId ? `#${referenceId}` : '';

    // 1. Extrai APENAS o elemento referenciado para calcular o digest
    //    (não o XML inteiro — isso causava assinatura inválida)
    let elementToDigest = xml;
    if (referenceId) {
      const extracted = this.extractReferencedElement(xml, idAttr, referenceId);
      if (extracted) {
        elementToDigest = extracted;
      }
    }

    // 2. Aplica transform enveloped-signature: remove <Signature> do elemento
    elementToDigest = elementToDigest.replace(/<Signature\s+xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"[\s\S]*?<\/Signature>/g, '');

    // 3. Canonicaliza o elemento referenciado (C14N)
    const canonicalElement = this.canonicalize(elementToDigest);

    // 4. Calcula digest (SHA1) do elemento canonicalizado
    const digestValue = this.calculateDigest(canonicalElement);

    // 5. Monta SignedInfo
    const signedInfo = this.buildSignedInfo(referenceUri, digestValue);

    // 6. Canonicaliza SignedInfo e assina com chave privada
    const canonicalSignedInfo = this.canonicalize(signedInfo);
    const signatureValue = this.calculateSignature(canonicalSignedInfo);

    // 7. Monta bloco Signature completo
    const signature = this.buildSignatureBlock(signedInfo, signatureValue);

    // 8. Insere assinatura no XML
    const signedXml = this.insertSignature(xml, signature);

    return {
      xml: signedXml,
      certificateInfo: this.getCertificateInfo(),
    };
  }

  /**
   * Extrai o elemento XML referenciado pelo Id
   * Retorna o elemento completo incluindo a tag de abertura e fechamento
   */
  private extractReferencedElement(xml: string, idAttr: string, idValue: string): string | null {
    // Encontra a tag que contém o atributo Id
    const openTagRegex = new RegExp(`<(\\w+)([^>]*${idAttr}="${idValue}"[^>]*)>`);
    const openTagMatch = xml.match(openTagRegex);
    if (!openTagMatch) return null;

    const tagName = openTagMatch[1];
    const startIndex = xml.indexOf(openTagMatch[0]);
    if (startIndex === -1) return null;

    // Encontra o fechamento correspondente da tag
    // Usa contagem de profundidade para lidar com tags aninhadas de mesmo nome
    let depth = 0;
    let searchPos = startIndex;
    const openPattern = new RegExp(`<${tagName}[\\s>/]`, 'g');
    const closePattern = new RegExp(`</${tagName}>`, 'g');

    // Conta a partir do início da tag encontrada
    const remaining = xml.substring(startIndex);
    openPattern.lastIndex = 0;
    closePattern.lastIndex = 0;

    let lastCloseEnd = -1;
    const opens: number[] = [];
    const closes: number[] = [];

    // Coleta todas as posições de abertura e fechamento
    let m;
    while ((m = openPattern.exec(remaining)) !== null) {
      opens.push(m.index);
    }
    while ((m = closePattern.exec(remaining)) !== null) {
      closes.push(m.index + m[0].length);
    }

    // Percorre para encontrar o fechamento correto
    depth = 0;
    let openIdx = 0;
    let closeIdx = 0;
    const closeTag = `</${tagName}>`;

    for (let i = 0; i < remaining.length; i++) {
      if (openIdx < opens.length && i === opens[openIdx]) {
        depth++;
        openIdx++;
      }
      if (closeIdx < closes.length && i === closes[closeIdx] - closeTag.length) {
        depth--;
        if (depth === 0) {
          return remaining.substring(0, closes[closeIdx]);
        }
        closeIdx++;
      }
    }

    return null;
  }

  /**
   * Canonicaliza XML (Canonical XML 1.0 — C14N)
   *
   * Implementação simplificada adequada para NFS-e ABRASF:
   * - Normaliza quebras de linha para LF
   * - Remove espaços entre tags (whitespace insignificante)
   * - Normaliza atributos (aspas duplas)
   * - Remove declaração XML (<?xml?>)
   * - Preserva namespaces
   */
  private canonicalize(xml: string): string {
    return xml
      // Normaliza quebras de linha para LF (C14N requirement)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove declaração XML (C14N exclui <?xml?>)
      .replace(/<\?xml[^?]*\?>\s*/gi, '')
      // Remove espaços insignificantes entre tags
      .replace(/>\s+</g, '><')
      // Remove espaços iniciais/finais
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
 * Deriva chave AES-256 a partir da ENCRYPTION_KEY e um salt.
 *
 * IMPORTANTE: versões anteriores usavam 'salt' literal (hardcoded).
 * Para manter compatibilidade com dados já criptografados, as funções
 * de decrypt tentam primeiro com o salt embutido nos dados, e depois
 * com o salt legado 'salt' se necessário.
 */
const LEGACY_SALT = 'salt';

function deriveKey(encryptionKey: string, salt: Buffer | string): Buffer {
  const saltBuf = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : salt;
  return crypto.scryptSync(encryptionKey, saltBuf, 32);
}

/**
 * Criptografa dados do certificado para armazenamento seguro
 */
export function encryptCertificateData(
  data: Buffer,
  encryptionKey: string
): { encrypted: string; iv: string } {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = deriveKey(encryptionKey, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    salt,               // 16 bytes salt
    cipher.update(data),
    cipher.final(),
    cipher.getAuthTag(), // 16 bytes auth tag
  ]);

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
  };
}

/**
 * Descriptografa dados do certificado
 * Compatível com formato novo (salt embutido) e legado (salt hardcoded)
 */
export function decryptCertificateData(
  encryptedBase64: string,
  ivBase64: string,
  encryptionKey: string
): Buffer {
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  const iv = Buffer.from(ivBase64, 'base64');

  // Tenta formato novo (primeiros 16 bytes = salt)
  if (encrypted.length > 32) {
    try {
      const salt = encrypted.subarray(0, 16);
      const authTag = encrypted.subarray(-16);
      const ciphertext = encrypted.subarray(16, -16);
      const key = deriveKey(encryptionKey, salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      // Se falhar, tenta formato legado
    }
  }

  // Formato legado (salt = 'salt' hardcoded)
  const authTag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(0, -16);
  const key = deriveKey(encryptionKey, LEGACY_SALT);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Criptografa senha do certificado
 * Formato: [salt 16B][iv 16B][ciphertext][authTag 16B] → base64
 */
export function encryptPassword(
  password: string,
  encryptionKey: string
): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = deriveKey(encryptionKey, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    salt,                            // 16 bytes salt (novo)
    iv,                              // 16 bytes IV
    cipher.update(password, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),             // 16 bytes auth tag
  ]);

  return encrypted.toString('base64');
}

/**
 * Descriptografa senha do certificado
 * Compatível com formato novo (salt+iv embutidos) e legado (iv embutido, salt hardcoded)
 */
export function decryptPassword(
  encryptedBase64: string,
  encryptionKey: string
): string {
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  // Tenta formato novo: [salt 16B][iv 16B][ciphertext][authTag 16B]
  if (encrypted.length > 48) {
    try {
      const salt = encrypted.subarray(0, 16);
      const iv = encrypted.subarray(16, 32);
      const authTag = encrypted.subarray(-16);
      const ciphertext = encrypted.subarray(32, -16);
      const key = deriveKey(encryptionKey, salt);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      // Se falhar, tenta formato legado
    }
  }

  // Formato legado: [iv 16B][ciphertext][authTag 16B] com salt='salt'
  const iv = encrypted.subarray(0, 16);
  const authTag = encrypted.subarray(-16);
  const ciphertext = encrypted.subarray(16, -16);
  const key = deriveKey(encryptionKey, LEGACY_SALT);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export default XmlSigner;
