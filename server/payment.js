
export async function confirmPayment({amount,orderId,provider="mock"}){
  if(provider==="mock") return {ok:true,status:"PAID",provider:"mock",orderId,amount};
  return {ok:false,status:"NOT_CONFIGURED",provider,orderId,amount,
    message:"실제 단말기/PG SDK가 정해지면 이 어댑터에 연결하세요."};
}
