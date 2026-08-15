declare module 'xml-crypto' {
    export interface SignedXmlOptions {
        privateKey?: string;
        publicCert?: string;
        signatureAlgorithm?: string;
        canonicalizationAlgorithm?: string;
        idAttribute?: string;
        getKeyInfoContent?: (options: any) => any;
        getCertFromKeyInfo?: (keyInfo: any) => any;
        existingPrefixes?: string[];
    }

    export interface Reference {
        xpath: string;
        transforms?: string[];
        digestAlgorithm?: string;
        digestValue?: string;
        uri?: string;
        inclusiveNamespacesPrefixList?: string[];
    }

    export interface SignatureAlgorithm {
        getSignature(signedInfo: string, privateKey: any, callback?: (err: any, value: string) => void): any;
        verifySignature?(material: string, key: any, signatureValue: string): any;
        getAlgorithmName(): string;
    }

    export interface HashAlgorithm {
        getHash(xml: string): string;
        getAlgorithmName(): string;
    }

    export interface TransformationAlgorithm {
        process(node: any, options?: any): any;
        getAlgorithmName(): string;
    }

    export interface SignatureValue {
        computeSignature: boolean;
    }

    export class SignedXml {
        constructor(options?: SignedXmlOptions);
        signatureAlgorithm?: string;
        canonicalizationAlgorithm?: string;
        inclusiveNamespacesPrefixList: string[];
        signatureValue: string;
        signedXml: string;
        references: Reference[];
        SignatureAlgorithms: { [name: string]: new () => SignatureAlgorithm };
        HashAlgorithms: { [name: string]: new () => HashAlgorithm };
        CanonicalizationAlgorithms: { [name: string]: new () => TransformationAlgorithm };
        addReference(reference: Partial<Reference> & Pick<Reference, 'xpath'>): void;
        computeSignature(xml: string, options?: any, callback?: (err: any, result: SignedXml) => void): void;
        getSignedXml(): string;
        getSignatureXml(): string;
        getOriginalXmlWithIds(): string;
        loadSignature(signatureNode: any): void;
    }
}
