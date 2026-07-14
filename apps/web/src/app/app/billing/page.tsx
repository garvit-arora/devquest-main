import { Plus, ReceiptText } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="min-h-[calc(100vh-48px)] bg-[#181818] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="border-b border-[#303030] pb-5">
          <h1 className="text-2xl font-semibold tracking-tight">Billing & Credits</h1>
          <p className="mt-2 text-sm text-[#aaa]">Monitor billing state and credit availability for your account.</p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded border border-[#333] bg-[#242424] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Credits</h2>
              <button className="inline-flex h-8 items-center gap-1.5 rounded bg-[#f7b500] px-3 text-sm font-semibold text-black hover:bg-[#ffc229]">
                <Plus size={17} />
                Earn Credits
              </button>
            </div>
            <p className="mt-12 text-2xl font-semibold">$0.00 <span className="text-sm font-medium text-[#aaa]">USD</span></p>
            <p className="mt-2 text-sm text-[#aaa]">Credits never expire and will be auto-applied to next billing</p>
          </section>

          <section className="rounded border border-[#333] bg-[#242424] p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Subscription</h2>
              <button className="mori-button mori-button-sm inline-flex">Subscribe</button>
            </div>
            <p className="mt-12 text-xl font-semibold">No Subscription</p>
            <p className="mt-2 text-sm text-[#aaa]">You are on free plan</p>
          </section>
        </div>

        <section className="mt-5 overflow-hidden rounded border border-[#333] bg-[#242424]">
          <div className="flex gap-2 border-b border-[#333] p-4">
            <button className="rounded bg-[#303030] px-3 py-1.5 text-sm font-semibold text-white">Invoice</button>
            <button className="rounded px-3 py-1.5 text-sm font-semibold text-[#aaa] hover:bg-[#2c2c2c] hover:text-white">Credit History</button>
          </div>
          <div className="grid min-h-[145px] place-items-center bg-[#181818] text-[#aaa]">
            <div className="text-center">
              <ReceiptText className="mx-auto mb-3 text-[#5f5f5f]" size={38} />
              <p className="text-sm font-semibold">No Invoice Available</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
