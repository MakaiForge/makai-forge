import { createSlice } from "@reduxjs/toolkit";

export interface SubscriptionState {
  isModalVisible: boolean;
}

const initialState: SubscriptionState = {
  isModalVisible: false,
};

export const subscriptionSlice = createSlice({
  name: "subscription",
  initialState,
  reducers: {},
});

export const {} = subscriptionSlice.actions;
