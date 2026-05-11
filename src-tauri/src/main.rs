// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TransactionType {
    Income,
    Expense,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    #[serde(rename = "type")]
    pub tx_type: TransactionType,
    pub amount: f64,
    pub category: String,
    pub description: String,
    pub date: String,
}

fn get_data_file_path() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = data_dir.join("lutiek-budget");
    fs::create_dir_all(&app_dir).ok();
    app_dir.join("transactions.json")
}

fn load_transactions() -> Vec<Transaction> {
    let path = get_data_file_path();
    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    } else {
        Vec::new()
    }
}

fn save_transactions(transactions: &[Transaction]) -> Result<(), String> {
    let path = get_data_file_path();
    let content = serde_json::to_string_pretty(transactions).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_transactions() -> Result<Vec<Transaction>, String> {
    Ok(load_transactions())
}

#[tauri::command]
fn add_transaction(
    tx_type: String,
    amount: f64,
    category: String,
    description: String,
    date: String,
) -> Result<Transaction, String> {
    let mut transactions = load_transactions();
    let new_tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: if tx_type == "income" {
            TransactionType::Income
        } else {
            TransactionType::Expense
        },
        amount,
        category,
        description,
        date,
    };
    transactions.push(new_tx.clone());
    save_transactions(&transactions)?;
    Ok(new_tx)
}

#[tauri::command]
fn update_transaction(
    id: String,
    tx_type: String,
    amount: f64,
    category: String,
    description: String,
    date: String,
) -> Result<Transaction, String> {
    let mut transactions = load_transactions();
    let idx = transactions
        .iter()
        .position(|t| t.id == id)
        .ok_or("Transaction not found")?;
    let updated = Transaction {
        id: id.clone(),
        tx_type: if tx_type == "income" {
            TransactionType::Income
        } else {
            TransactionType::Expense
        },
        amount,
        category,
        description,
        date,
    };
    transactions[idx] = updated.clone();
    save_transactions(&transactions)?;
    Ok(updated)
}

#[tauri::command]
fn delete_transaction(id: String) -> Result<(), String> {
    let mut transactions = load_transactions();
    transactions.retain(|t| t.id != id);
    save_transactions(&transactions)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_transactions,
            add_transaction,
            update_transaction,
            delete_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
