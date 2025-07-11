import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { usersTable } from "@/db/schema";

export const POST = async (request: Request) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe secret key not found");
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    throw new Error("Stripe signature not found");
  }
  const text = await request.text();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-05-28.basil",
  });
  const event = stripe.webhooks.constructEvent(
    text,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Pega o userId que você enviou na Etapa 1
      const userId = session.metadata?.userId;
      const subscriptionId = session.subscription as string;
      const customerId = session.customer as string;

      if (!userId) {
        console.error(
          "ERRO CRÍTICO: userId não encontrado na metadata do checkout.session.completed.",
        );
        break; // Sai, mas retorna 200 para o Stripe não reenviar.
      }

      if (!subscriptionId || !customerId) {
        console.error(
          "ERRO: ID da assinatura ou do cliente faltando no evento.",
        );
        break;
      }

      // Atualiza a tabela do usuário com os dados da nova assinatura
      await db
        .update(usersTable)
        .set({
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: customerId,
          plan: "essential", // ou o plano correspondente
        })
        .where(eq(usersTable.id, userId));

      console.log(`✅ Nova assinatura criada para o usuário: ${userId}`);
      break;
    }
    case "invoice.paid": {
      if (!event.data.object.id) {
        throw new Error("Subscription ID not found");
      }
      console.log(event.data);
      const customer = (event.data.object as { customer: string }).customer;
      const { subscription_details } = event.data.object.parent as unknown as {
        subscription_details: {
          subscription: string;
          metadata: {
            userId: string;
          };
        };
      };
      const subscription = subscription_details.subscription;
      if (!subscription) {
        throw new Error("Subscription not found");
      }
      const userId = subscription_details.metadata.userId;
      if (!userId) {
        throw new Error("User ID not found");
      }
      await db
        .update(usersTable)
        .set({
          stripeSubscriptionId: subscription,
          stripeCustomerId: customer,
          plan: "essential",
        })
        .where(eq(usersTable.id, userId));
      break;
    }
    case "customer.subscription.deleted": {
      if (!event.data.object.id) {
        throw new Error("Subscription ID not found");
      }
      const subscription = await stripe.subscriptions.retrieve(
        event.data.object.id,
      );
      if (!subscription) {
        throw new Error("Subscription not found");
      }
      const userId = subscription.metadata.userId;
      if (!userId) {
        throw new Error("User ID not found");
      }
      await db
        .update(usersTable)
        .set({
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          plan: null,
        })
        .where(eq(usersTable.id, userId));
    }
  }
  return NextResponse.json({
    received: true,
  });
};
