# Order state machine (design draft)

Four separate status fields: order, payment, shipment, refund. Only one backend function may change them. Each change writes OrderStatusHistory (from, to, actor, time, remarks) and an audit log row in the same database transaction.

## Order status transitions
| From | Allowed to | Guard |
|---|---|---|
| pending_payment | confirmed | payment verified by server, or COD accepted |
| pending_payment | cancelled | payment failed/expired; release stock reservation |
| confirmed | processing | stock reservation valid |
| confirmed | cancelled | no shipment created; refund started if paid |
| processing | ready_for_packing | order manager assigned |
| ready_for_packing | packing | packing employee assigned |
| packing | packed | every item verified, weight and dimensions recorded |
| packing | processing | packing issue logged |
| packed | ready_for_dispatch | shipment record created |
| ready_for_dispatch | shipped | real AWB and tracking stored |
| shipped | out_for_delivery | courier event or labelled manual update |
| out_for_delivery | delivered | courier evidence or documented manual confirmation |
| out_for_delivery | delivery_exception | delivery failed event |
| delivery_exception | out_for_delivery / returned_to_origin | exception resolution recorded |
| delivered | return_requested | inside return window set in settings |
| return_requested | return_approved / return_rejected | support decision |
| return_approved | return_received | item received |
| return_received | inspected | inspection record |
| inspected | refund_pending | approved after inspection |

Not allowed: unpaid prepaid order to shipped; delivered back to any earlier state; any direct status edit.

## Payment status
created, pending, authorised, captured, failed, refunded_partial, refunded. COD: pending_collection, collected, reconciled. Change only from verified Razorpay webhooks, server-side verification, or documented COD collection.

## Stock rules
Reserve at order creation, release on failure/expiry/cancel, commit on confirmation (policy to be set in settings). Every change is a ledger row; never overwrite quantities.

## Open decisions for the business
Return window length, who may cancel after processing, stock commit point, COD availability by PIN code.
