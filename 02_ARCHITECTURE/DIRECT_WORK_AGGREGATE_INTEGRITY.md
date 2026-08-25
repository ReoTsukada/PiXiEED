# Direct Work Aggregate Integrity

Status: `FP-002 COMPLETE_ISOLATED`
Version: `DIRECT_WORK_GRAPH_V1`

## Purpose

Direct Work の取引レコードを、Requestを唯一のAggregate rootとする一つのIdentity Graphへ
拘束する。FP-001の`AuthorizationProofV1`を権限境界として再利用し、FP-002では権限契約、
Commerceの金額計算、Ledger、Durable Eventを再定義しない。

```text
Request
  → Quote
  → Agreement
  → Milestone
  → Delivery
  → Acceptance
  → Rights
  → Payment
```

## Canonical identity

全レコードは`DirectWorkAggregateIdentity`を持つ。

- `graphVersion`: `DIRECT_WORK_GRAPH_V1`
- `aggregateId` / `requestId`: root Request ID
- child record ID: Quote、Agreement、Milestone、Delivery、Acceptance、Rights、Paymentの親鎖

各Factoryは親からIdentityを派生させる。下流Factoryは、親レコードのSeal、root、親ID、
Request snapshot、Quote terms snapshotを同時に検証する。別Requestの実レコードを差し込む、
親IDだけを書き換える、別のTermsをAgreementへ渡す、という組合せは成功しない。

## Quote approval and terms

QuoteをAcceptanceした時点で`acceptedTermsHash`を固定する。Agreementの`termsHash`は、
Accepted Quoteの`termsHash`と`acceptedTermsHash`に一致しなければならない。Paymentも、
同じQuote、Agreement、RequestのIdentityとTermsを検証し、任意の金額・Royalty・Licenseを
受け取らない。金額のCanonical化とLedger計算はWP-220既存契約の責務であり、FP-003で扱う。

## In-memory record seal

Isolated CoreのFactoryが生成した各レコードは、凍結されたsnapshotを内部のWeakMap Sealへ
登録する。下流境界では、生成元のrecord identityとsnapshotが一致することを確認する。
したがって、Factory出力をspreadしてTermsや親IDだけを変更したcaller-created objectは、
正規レコードとして受理されない。

このSealはセッション内の偽造・変更検出用であり、AuthorizationProof、署名、Durable Event、
永続化の代替ではない。永続化／Server Adapterは、canonical fieldsを入力として検証済み
Factoryまたは専用rehydration境界を通す。FP-004で耐久イベント・replay・crash recoveryを
別途扱う。

## Explicit non-scope

- FP-003 Commerce/Royalty/Ledger Transaction
- FP-004 Durable Event/Inbox/Outbox
- Provider webhook、Checkout、DB/RLS/RPC、Storage、Route、Production data
- Market Product/Purchase/Entitlement、Subscription、general DM
- Migration、Deploy、Publish、Commit、Push
