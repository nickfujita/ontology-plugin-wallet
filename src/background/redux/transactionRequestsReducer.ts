/*
 * Copyright (C) 2018 Matus Zamborsky
 * This file is part of The Ontology Wallet&ID.
 *
 * The The Ontology Wallet&ID is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * The Ontology Wallet&ID is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with The Ontology Wallet&ID.  If not, see <http://www.gnu.org/licenses/>.
 */
import { Identity } from 'ontology-ts-sdk';
import { timeout, TimeoutError } from 'promise-timeout';
import { Dispatch, Reducer } from 'redux';
import { getWallet } from '../../api/authApi';
import Actions from '../../redux/actions';
import { GlobalState } from '../../redux/state';
import {
  ADD_TRANSACTION_REQUEST,
  RegisterOntIdRequest,
  RESOLVE_TRANSACTION_REQUEST,
  ScCallReadRequest,
  ScCallRequest,
  ScDeployRequest,
  SUBMIT_REQUEST,
  TransactionRequestsState,
  TransferRequest,
  UPDATE_REQUEST,
  WithdrawOngRequest,
} from '../../redux/transactionRequests';
import { registerOntId, transfer, withdrawOng } from '../api/runtimeApi';
import { scCall, scCallRead, scDeploy } from '../api/smartContractApi';

const defaultState: TransactionRequestsState = { requests: [] };

export const transactionRequestsReducer: Reducer<TransactionRequestsState> = (state = defaultState, action) => {
  switch (action.type) {
    case ADD_TRANSACTION_REQUEST:
      return { ...state, requests: [...state.requests, action.request] };
    case RESOLVE_TRANSACTION_REQUEST:
      return {
        ...state,
        requests: [
          ...state.requests.filter((r) => r.id !== action.id),
          {
            ...state.requests.find((r) => r.id === action.id),
            error: action.error,
            resolved: true,
            result: action.result,
          },
        ],
      };
    case UPDATE_REQUEST:
      return {
        ...state,
        requests: [
          ...state.requests.filter((r) => r.id !== action.id),
          {
            ...state.requests.find((r) => r.id === action.id),
            ...action.request,
          },
        ],
      };
    default:
      return state;
  }
};

export const transactionRequestsAliases = {
  [SUBMIT_REQUEST]: (action: any) => {
    return async (dispatch: Dispatch, getState: () => GlobalState) => {
      const requestId: string = action.id;
      const password: string | undefined = action.password;

      const state = getState();
      const requests = state.transactionRequests.requests;
      const request = requests.find((r) => r.id === requestId);

      if (request === undefined) {
        throw new Error('Request already submited');
      }

      let result: any;
      try {
        switch (request.type) {
          case 'transfer':
            result = await submitTransfer(request as TransferRequest, password!);
            break;
          case 'withdraw_ong':
            result = await submitWithdrawOng(request as WithdrawOngRequest, password!);
            break;
          case 'register_ont_id':
            result = await submitRegisterOntId(request as RegisterOntIdRequest, password!, dispatch, state);
            break;
          case 'sc_call':
            result = await submitScCall(request as ScCallRequest, password!);
            break;
          case 'sc_call_read':
            result = await submitScCallRead(request as ScCallReadRequest);
            break;
          case 'sc_deploy':
            result = await submitScDeploy(request as ScDeployRequest, password!);
            break;
        }

        // resolves request
        dispatch(Actions.transactionRequests.resolveRequest(requestId, undefined, result));
      } catch (e) {
        if (e instanceof TimeoutError) {
          // resolves request
          dispatch(Actions.transactionRequests.resolveRequest(requestId, 'TIMEOUT'));
        } else {
          // resolves request
          dispatch(Actions.transactionRequests.resolveRequest(requestId, 'OTHER'));
          // tslint:disable-next-line:no-console
          console.error('Error during submiting transaction', e);
        }
      }
    };
  },
};

function submitTransfer(request: TransferRequest, password: string) {
  return timeout(transfer(request, password).then(r => r.Result.TxHash), 15000);
}

function submitWithdrawOng(request: WithdrawOngRequest, password: string) {
  return timeout(withdrawOng(request, password), 15000);
}

async function submitRegisterOntId(
  request: RegisterOntIdRequest,
  password: string,
  dispatch: Dispatch,
  state: GlobalState,
) {
  await timeout(registerOntId(request, password), 15000);

  // stores identity in wallet
  const identity = Identity.parseJson(request.identity);
  const wallet = getWallet(state.wallet.wallet!);
  wallet.addIdentity(identity);
  wallet.setDefaultIdentity(identity.ontid);

  await dispatch(Actions.wallet.setWallet(wallet.toJson()));
}

function submitScCall(request: ScCallRequest, password: string) {
  return timeout(scCall(request, password), 15000);
}

function submitScCallRead(request: ScCallReadRequest) {
  return timeout(scCallRead(request), 15000);
}

function submitScDeploy(request: ScDeployRequest, password: string) {
  return timeout(scDeploy(request, password), 15000);
}
