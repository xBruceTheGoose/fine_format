import { FineTuningMethod, QAPair } from '../types';

export class GuideService {
  public static generateFineTuningGuide(
    method: FineTuningMethod,
    qaPairs: QAPair[],
    sourceCount: number,
    themes: string[]
  ): string {
    const correctCount = qaPairs.filter(p => p.isCorrect).length;
    const incorrectCount = qaPairs.filter(p => !p.isCorrect).length;
    const timestamp = new Date().toISOString().split('T')[0];

    const header = `# Fine Format - Fine-Tuning Guide
Generated on: ${timestamp}
Platform: ${this.getMethodName(method)}
Dataset: ${qaPairs.length} Q&A pairs (${correctCount} correct, ${incorrectCount} incorrect)
Sources: ${sourceCount} documents/URLs
Key Themes: ${themes.join(', ')}

---

`;

    switch (method) {
      case 'pytorch':
        return header + this.generatePyTorchGuide(qaPairs, correctCount, incorrectCount);
      case 'together':
        return header + this.generateTogetherGuide(qaPairs, correctCount, incorrectCount);
      case 'huggingface':
        return header + this.generateHuggingFaceGuide(qaPairs, correctCount, incorrectCount);
      case 'colab':
        return header + this.generateColabGuide(qaPairs, correctCount, incorrectCount);
      case 'openai':
        return header + this.generateOpenAIGuide(qaPairs, correctCount, incorrectCount);
      case 'anthropic':
        return header + this.generateAnthropicGuide(qaPairs, correctCount, incorrectCount);
      default:
        return header + this.generateGenericGuide(qaPairs, correctCount, incorrectCount);
    }
  }

  private static getMethodName(method: FineTuningMethod): string {
    const names = {
      pytorch: 'PyTorch',
      together: 'Together.ai',
      huggingface: 'Hugging Face',
      colab: 'Google Colab/Jupyter',
      openai: 'OpenAI',
      anthropic: 'Anthropic Claude',
      generic: 'Generic/Custom'
    };
    return names[method] || 'Unknown';
  }

  private static generatePyTorchGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## PyTorch Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Correct answers: ${correctCount} (${((correctCount / qaPairs.length) * 100).toFixed(1)}%)
- Incorrect answers: ${incorrectCount} (${((incorrectCount / qaPairs.length) * 100).toFixed(1)}%)

### Setup Instructions

1. **Install Dependencies**
\`\`\`bash
pip install torch transformers datasets accelerate wandb
\`\`\`

2. **Load Your Dataset**
\`\`\`python
import json
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments

# Load the dataset
with open('your_dataset.json', 'r') as f:
    data = json.load(f)

dataset = data['data']
\`\`\`

3. **Create Custom Dataset Class**
\`\`\`python
class QADataset(Dataset):
    def __init__(self, data, tokenizer, max_length=512):
        self.data = data
        self.tokenizer = tokenizer
        self.max_length = max_length
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        item = self.data[idx]
        text = f"Question: {item['input_text']} Answer: {item['target_text']}"
        
        encoding = self.tokenizer(
            text,
            truncation=True,
            padding='max_length',
            max_length=self.max_length,
            return_tensors='pt'
        )
        
        return {
            'input_ids': encoding['input_ids'].flatten(),
            'attention_mask': encoding['attention_mask'].flatten(),
            'labels': torch.tensor(item['label'], dtype=torch.long)
        }
\`\`\`

### Optimal Parameters for Your Dataset

**Recommended Training Arguments:**
\`\`\`python
training_args = TrainingArguments(
    output_dir='./fine_format_model',
    num_train_epochs=3,              # Start with 3 epochs
    per_device_train_batch_size=8,   # Adjust based on GPU memory
    per_device_eval_batch_size=16,
    warmup_steps=100,                # ~10% of total steps
    weight_decay=0.01,
    logging_dir='./logs',
    logging_steps=50,
    evaluation_strategy="steps",
    eval_steps=200,
    save_steps=500,
    load_best_model_at_end=True,
    metric_for_best_model="eval_accuracy",
    learning_rate=2e-5,              # Conservative for stability
    fp16=True,                       # Enable if using compatible GPU
    dataloader_num_workers=4,
    remove_unused_columns=False,
)
\`\`\`

**Model Selection:**
- For classification: \`bert-base-uncased\` or \`roberta-base\`
- For generation: \`t5-base\` or \`gpt2-medium\`

### Training Tips
- Monitor validation accuracy closely
- Use early stopping if validation loss plateaus
- The ${incorrectCount} incorrect examples will help reduce hallucination
- Consider class weighting if accuracy is imbalanced

### Expected Results
With ${qaPairs.length} samples, expect:
- Training time: 30-60 minutes on modern GPU
- Target accuracy: 85-95% on validation set
- Convergence: Usually within 2-3 epochs
`;
  }

  private static generateTogetherGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## Together.ai Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Correct answers: ${correctCount}
- Incorrect answers: ${incorrectCount}
- Format: JSONL with human/bot conversation pairs

### Setup Instructions

1. **Install Together AI CLI**
\`\`\`bash
pip install together
\`\`\`

2. **Set API Key**
\`\`\`bash
export TOGETHER_API_KEY="your_api_key_here"
\`\`\`

3. **Upload Dataset**
\`\`\`bash
together files upload your_dataset.jsonl
\`\`\`

### Optimal Parameters for Your Dataset

**Recommended Configuration:**
\`\`\`python
import together

# Create fine-tuning job
response = together.Fine_tuning.create(
    training_file="your_dataset.jsonl",
    model="meta-llama/Llama-2-7b-chat-hf",  # Recommended base model
    n_epochs=3,                              # Good starting point
    learning_rate=1e-5,                      # Conservative for stability
    batch_size=4,                            # Adjust based on model size
    wandb_api_key="your_wandb_key"          # Optional: for monitoring
)
\`\`\`

**Model Recommendations:**
- **Llama-2-7b-chat**: Best balance of performance and cost
- **Llama-2-13b-chat**: Higher quality, more expensive
- **Code-Llama-7b**: If your content is technical/code-related

### Training Configuration
\`\`\`json
{
  "model": "meta-llama/Llama-2-7b-chat-hf",
  "training_file": "your_dataset.jsonl",
  "validation_file": null,
  "n_epochs": 3,
  "learning_rate": 1e-5,
  "batch_size": 4,
  "suffix": "fine-format-${timestamp}"
}
\`\`\`

### Monitoring and Evaluation
\`\`\`python
# Check training status
status = together.Fine_tuning.retrieve(response.id)
print(f"Status: {status.status}")

# List all fine-tuning jobs
jobs = together.Fine_tuning.list()
\`\`\`

### Expected Results
- Training time: 2-4 hours for ${qaPairs.length} samples
- Cost estimate: $20-50 depending on model size
- The incorrect examples will improve response quality
- Target performance: 90%+ accuracy on similar questions

### Usage After Training
\`\`\`python
# Use your fine-tuned model
response = together.Complete.create(
    model="your_fine_tuned_model_id",
    prompt="<human>: Your question here\\n<bot>:",
    max_tokens=200,
    temperature=0.7
)
\`\`\`
`;
  }

  private static generateHuggingFaceGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## Hugging Face Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Training split: ${Math.floor(qaPairs.length * 0.8)} samples
- Validation split: ${Math.ceil(qaPairs.length * 0.2)} samples
- Correct/Incorrect ratio: ${correctCount}/${incorrectCount}

### Setup Instructions

1. **Install Dependencies**
\`\`\`bash
pip install transformers datasets accelerate evaluate wandb
pip install torch torchvision torchaudio  # or tensorflow
\`\`\`

2. **Load Dataset**
\`\`\`python
from datasets import Dataset, DatasetDict
import json

# Load your dataset
with open('your_dataset.json', 'r') as f:
    data = json.load(f)

# Create train/validation splits
train_data = [item for item in data['data'] if item['split'] == 'train']
val_data = [item for item in data['data'] if item['split'] == 'validation']

# Create HuggingFace dataset
dataset = DatasetDict({
    'train': Dataset.from_list(train_data),
    'validation': Dataset.from_list(val_data)
})
\`\`\`

### Optimal Parameters for Your Dataset

**Model Selection:**
\`\`\`python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

model_name = "microsoft/DialoGPT-medium"  # For conversational AI
# Alternative: "facebook/blenderbot-400M-distill" for Q&A

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(
    model_name, 
    num_labels=2  # Correct/Incorrect classification
)
\`\`\`

**Training Configuration:**
\`\`\`python
from transformers import TrainingArguments, Trainer

training_args = TrainingArguments(
    output_dir="./fine-format-model",
    evaluation_strategy="steps",
    eval_steps=100,
    logging_steps=50,
    save_steps=500,
    num_train_epochs=3,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=16,
    warmup_steps=100,
    weight_decay=0.01,
    learning_rate=2e-5,
    fp16=True,
    push_to_hub=True,
    hub_model_id="your-username/fine-format-model",
    report_to="wandb",  # Optional: for experiment tracking
    load_best_model_at_end=True,
    metric_for_best_model="eval_accuracy",
    greater_is_better=True,
)
\`\`\`

### Data Preprocessing
\`\`\`python
def preprocess_function(examples):
    # Combine question and answer
    inputs = [f"Question: {q} Answer: {a}" for q, a in zip(examples['question'], examples['answer'])]
    
    model_inputs = tokenizer(
        inputs,
        truncation=True,
        padding=True,
        max_length=512
    )
    
    # Convert labels
    model_inputs["labels"] = [1 if label == "CORRECT" else 0 for label in examples["label"]]
    return model_inputs

tokenized_dataset = dataset.map(preprocess_function, batched=True)
\`\`\`

### Training Script
\`\`\`python
from transformers import Trainer
import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    
    accuracy = accuracy_score(labels, predictions)
    precision, recall, f1, _ = precision_recall_fscore_support(labels, predictions, average='weighted')
    
    return {
        'accuracy': accuracy,
        'f1': f1,
        'precision': precision,
        'recall': recall
    }

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
    eval_dataset=tokenized_dataset["validation"],
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)

# Start training
trainer.train()

# Save the model
trainer.save_model()
tokenizer.save_pretrained("./fine-format-model")
\`\`\`

### Expected Results
- Training time: 1-2 hours on GPU
- Target metrics: 90%+ accuracy, 0.85+ F1 score
- The ${incorrectCount} incorrect examples improve discrimination
- Model size: ~500MB for DialoGPT-medium

### Model Usage
\`\`\`python
from transformers import pipeline

# Load your fine-tuned model
classifier = pipeline("text-classification", model="./fine-format-model")

# Test the model
result = classifier("Question: What is AI? Answer: Artificial Intelligence is...")
print(f"Prediction: {result[0]['label']}, Confidence: {result[0]['score']:.3f}")
\`\`\`

### Publishing to Hub
\`\`\`python
# Push to Hugging Face Hub
trainer.push_to_hub("fine-format-${timestamp}")
\`\`\`
`;
  }

  private static generateColabGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## Google Colab/Jupyter Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Training set: ${Math.floor(qaPairs.length * 0.8)} samples
- Test set: ${Math.ceil(qaPairs.length * 0.2)} samples
- Correct/Incorrect ratio: ${correctCount}/${incorrectCount}

### Colab Setup (Copy-Paste Ready)

**Cell 1: Install Dependencies**
\`\`\`python
!pip install transformers datasets torch accelerate wandb -q
!pip install scikit-learn matplotlib seaborn -q

import json
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
import warnings
warnings.filterwarnings('ignore')

print("✅ Dependencies installed successfully!")
\`\`\`

**Cell 2: Upload and Load Dataset**
\`\`\`python
# Upload your JSON file using Colab's file upload
from google.colab import files
uploaded = files.upload()

# Load the dataset
filename = list(uploaded.keys())[0]
with open(filename, 'r') as f:
    data = json.load(f)

df = pd.DataFrame(data['dataset'])
print(f"📊 Dataset loaded: {len(df)} samples")
print(f"✅ Correct answers: {len(df[df['correct'] == True])}")
print(f"❌ Incorrect answers: {len(df[df['correct'] == False])}")

# Display sample data
df.head()
\`\`\`

**Cell 3: Data Exploration**
\`\`\`python
# Visualize dataset distribution
plt.figure(figsize=(12, 4))

plt.subplot(1, 2, 1)
df['correct'].value_counts().plot(kind='bar', color=['red', 'green'])
plt.title('Correct vs Incorrect Answers')
plt.xlabel('Answer Type')
plt.ylabel('Count')

plt.subplot(1, 2, 2)
df['confidence_score'].hist(bins=20, alpha=0.7)
plt.title('Confidence Score Distribution')
plt.xlabel('Confidence Score')
plt.ylabel('Frequency')

plt.tight_layout()
plt.show()

# Text length analysis
df['input_length'] = df['input'].str.len()
df['output_length'] = df['output'].str.len()
print(f"Average input length: {df['input_length'].mean():.1f} characters")
print(f"Average output length: {df['output_length'].mean():.1f} characters")
\`\`\`

### Optimal Parameters for Your Dataset

**Cell 4: Model Setup**
\`\`\`python
# Choose model based on your needs
MODEL_NAME = "microsoft/DialoGPT-small"  # Fast training, good for Colab
# Alternative: "distilbert-base-uncased" for classification

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME, 
    num_labels=2,
    problem_type="single_label_classification"
)

print(f"✅ Model loaded: {MODEL_NAME}")
print(f"📝 Vocabulary size: {len(tokenizer)}")
\`\`\`

**Cell 5: Data Preprocessing**
\`\`\`python
def preprocess_data(df):
    # Combine input and output
    df['text'] = df['input'] + " [SEP] " + df['output']
    df['labels'] = df['correct'].astype(int)
    return df

# Preprocess and split
df_processed = preprocess_data(df)
train_df, test_df = train_test_split(
    df_processed, 
    test_size=0.2, 
    random_state=42, 
    stratify=df_processed['labels']
)

print(f"📚 Training samples: {len(train_df)}")
print(f"🧪 Test samples: {len(test_df)}")

def tokenize_function(examples):
    return tokenizer(
        examples['text'],
        truncation=True,
        padding=True,
        max_length=512
    )

# Create datasets
train_dataset = Dataset.from_pandas(train_df[['text', 'labels']])
test_dataset = Dataset.from_pandas(test_df[['text', 'labels']])

train_dataset = train_dataset.map(tokenize_function, batched=True)
test_dataset = test_dataset.map(tokenize_function, batched=True)

print("✅ Data preprocessing complete!")
\`\`\`

**Cell 6: Training Configuration**
\`\`\`python
# Optimal training arguments for Colab
training_args = TrainingArguments(
    output_dir='./fine-format-results',
    num_train_epochs=3,                    # Good balance for ${qaPairs.length} samples
    per_device_train_batch_size=8,         # Colab-friendly batch size
    per_device_eval_batch_size=16,
    warmup_steps=50,                       # 10% of total steps
    weight_decay=0.01,
    logging_dir='./logs',
    logging_steps=25,
    evaluation_strategy="steps",
    eval_steps=100,
    save_steps=200,
    load_best_model_at_end=True,
    metric_for_best_model="eval_accuracy",
    learning_rate=2e-5,                    # Conservative for stability
    fp16=True,                             # Faster training on Colab
    dataloader_num_workers=2,              # Colab limitation
    report_to=None,                        # Disable wandb for simplicity
)

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    
    from sklearn.metrics import accuracy_score, f1_score
    accuracy = accuracy_score(labels, predictions)
    f1 = f1_score(labels, predictions, average='weighted')
    
    return {
        'accuracy': accuracy,
        'f1': f1
    }

print("⚙️ Training configuration ready!")
\`\`\`

**Cell 7: Training**
\`\`\`python
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
    tokenizer=tokenizer,
    compute_metrics=compute_metrics,
)

print("🚀 Starting training...")
trainer.train()

print("✅ Training complete!")

# Save the model
trainer.save_model('./fine-format-model')
tokenizer.save_pretrained('./fine-format-model')
print("💾 Model saved!")
\`\`\`

**Cell 8: Evaluation and Testing**
\`\`\`python
# Evaluate the model
eval_results = trainer.evaluate()
print("📊 Evaluation Results:")
for key, value in eval_results.items():
    print(f"{key}: {value:.4f}")

# Test on sample data
from transformers import pipeline
classifier = pipeline("text-classification", model="./fine-format-model", tokenizer=tokenizer)

# Test examples
test_examples = [
    "What is machine learning? Machine learning is a subset of AI that enables computers to learn.",
    "What is the capital of Mars? The capital of Mars is New York City.",  # Incorrect example
]

print("\\n🧪 Testing on sample examples:")
for i, example in enumerate(test_examples):
    result = classifier(example)
    print(f"Example {i+1}: {result[0]['label']} (confidence: {result[0]['score']:.3f})")
\`\`\`

### Expected Results for Your Dataset
- **Training time**: 15-30 minutes on Colab GPU
- **Memory usage**: ~2-4GB GPU memory
- **Target accuracy**: 85-92% on test set
- **F1 score**: 0.80-0.90

### Tips for Colab Success
1. **Enable GPU**: Runtime → Change runtime type → GPU
2. **Monitor memory**: Use \`!nvidia-smi\` to check GPU usage
3. **Save frequently**: Download model checkpoints regularly
4. **Batch size**: Reduce if you get OOM errors

### Download Your Model
\`\`\`python
# Zip and download the trained model
!zip -r fine_format_model.zip ./fine-format-model
files.download('fine_format_model.zip')
\`\`\`
`;
  }

  private static generateOpenAIGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## OpenAI Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Correct answers: ${correctCount}
- Incorrect answers: ${incorrectCount}
- Format: JSONL with message-based conversations

### Setup Instructions

1. **Install OpenAI CLI**
\`\`\`bash
pip install openai
\`\`\`

2. **Set API Key**
\`\`\`bash
export OPENAI_API_KEY="your_api_key_here"
\`\`\`

3. **Validate Dataset Format**
\`\`\`bash
openai tools fine_tunes.prepare_data -f your_dataset.jsonl
\`\`\`

### Optimal Parameters for Your Dataset

**Model Selection:**
- **gpt-3.5-turbo**: Recommended for most use cases
- **gpt-4**: Higher quality but more expensive
- **davinci-002**: For completion-style tasks

**Training Configuration:**
\`\`\`python
import openai

# Upload training file
with open("your_dataset.jsonl", "rb") as f:
    training_file = openai.File.create(
        file=f,
        purpose='fine-tune'
    )

# Create fine-tuning job
fine_tune_job = openai.FineTuningJob.create(
    training_file=training_file.id,
    model="gpt-3.5-turbo",
    hyperparameters={
        "n_epochs": 3,                    # Good for ${qaPairs.length} samples
        "batch_size": 8,                  # Optimal for your dataset size
        "learning_rate_multiplier": 0.1   # Conservative approach
    },
    suffix="fine-format-${timestamp}"
)

print(f"Fine-tuning job created: {fine_tune_job.id}")
\`\`\`

### Recommended Hyperparameters

Based on your dataset size (${qaPairs.length} samples):

\`\`\`json
{
  "n_epochs": 3,
  "batch_size": 8,
  "learning_rate_multiplier": 0.1,
  "prompt_loss_weight": 0.01
}
\`\`\`

**Rationale:**
- **3 epochs**: Prevents overfitting with ${qaPairs.length} samples
- **Batch size 8**: Optimal for stability and convergence
- **Learning rate 0.1**: Conservative to maintain base model knowledge
- **Prompt loss weight 0.01**: Focus on completion quality

### Monitoring Training

\`\`\`python
# Check training status
job_status = openai.FineTuningJob.retrieve(fine_tune_job.id)
print(f"Status: {job_status.status}")

# List training events
events = openai.FineTuningJob.list_events(fine_tune_job.id, limit=10)
for event in events.data:
    print(f"{event.created_at}: {event.message}")

# Monitor training metrics
if job_status.status == "succeeded":
    print(f"✅ Training completed!")
    print(f"📊 Training loss: {job_status.trained_tokens}")
    print(f"🎯 Model ID: {job_status.fine_tuned_model}")
\`\`\`

### Cost Estimation

For your dataset:
- **Training cost**: ~$${(qaPairs.length * 0.008).toFixed(2)} (${qaPairs.length} samples × $0.008/1K tokens)
- **Usage cost**: $0.012/1K tokens (input) + $0.016/1K tokens (output)
- **Total estimated training cost**: $${(qaPairs.length * 0.008 * 1.2).toFixed(2)}

### Usage After Training

\`\`\`python
# Use your fine-tuned model
response = openai.ChatCompletion.create(
    model="ft:gpt-3.5-turbo:your-org:fine-format:abc123",
    messages=[
        {"role": "system", "content": "You are a helpful assistant trained on specific domain knowledge."},
        {"role": "user", "content": "Your question here"}
    ],
    temperature=0.7,
    max_tokens=200
)

print(response.choices[0].message.content)
\`\`\`

### Quality Validation

\`\`\`python
# Test model performance
test_questions = [
    "What is the main topic discussed?",
    "How does this concept work?",
    "What are the key benefits?"
]

for question in test_questions:
    response = openai.ChatCompletion.create(
        model="your_fine_tuned_model_id",
        messages=[{"role": "user", "content": question}],
        temperature=0.3  # Lower temperature for consistency
    )
    print(f"Q: {question}")
    print(f"A: {response.choices[0].message.content}\\n")
\`\`\`

### Expected Results
- **Training time**: 10-30 minutes
- **Accuracy improvement**: 15-25% over base model
- **Domain relevance**: Significantly improved for your specific topics
- **Hallucination reduction**: ${incorrectCount} incorrect examples help model learn boundaries

### Best Practices
1. **Start small**: Begin with 3 epochs, increase if needed
2. **Monitor overfitting**: Watch for increasing validation loss
3. **Test thoroughly**: Use held-out examples for validation
4. **Version control**: Keep track of different model versions
5. **Cost management**: Set usage limits to control expenses

### Troubleshooting
- **High loss**: Increase learning rate multiplier to 0.2
- **Overfitting**: Reduce epochs to 2 or add more diverse data
- **Poor performance**: Check data quality and format consistency
`;
  }

  private static generateAnthropicGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## Anthropic Claude Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Correct answers: ${correctCount}
- Incorrect answers: ${incorrectCount}
- Format: JSONL with prompt-completion pairs

### Setup Instructions

1. **Install Anthropic SDK**
\`\`\`bash
pip install anthropic
\`\`\`

2. **Set API Key**
\`\`\`bash
export ANTHROPIC_API_KEY="your_api_key_here"
\`\`\`

3. **Prepare Dataset**
Your dataset is already formatted for Anthropic's fine-tuning API with prompt-completion pairs.

### Optimal Parameters for Your Dataset

**Model Selection:**
- **claude-3-haiku**: Fast and cost-effective
- **claude-3-sonnet**: Balanced performance and cost
- **claude-3-opus**: Highest quality (when available)

**Training Configuration:**
\`\`\`python
import anthropic

client = anthropic.Anthropic()

# Upload training data
with open("your_dataset.jsonl", "rb") as f:
    training_file = client.files.create(
        file=f,
        purpose="fine-tune"
    )

# Create fine-tuning job
fine_tune_job = client.fine_tuning.jobs.create(
    training_file=training_file.id,
    model="claude-3-haiku-20240307",
    hyperparameters={
        "n_epochs": 3,
        "batch_size": 4,
        "learning_rate": 1e-5,
        "warmup_steps": 100
    },
    suffix="fine-format"
)

print(f"Fine-tuning job ID: {fine_tune_job.id}")
\`\`\`

### Recommended Hyperparameters

For your dataset size (${qaPairs.length} samples):

\`\`\`json
{
  "n_epochs": 3,
  "batch_size": 4,
  "learning_rate": 1e-5,
  "warmup_steps": 100,
  "weight_decay": 0.01
}
\`\`\`

**Parameter Explanation:**
- **3 epochs**: Optimal for ${qaPairs.length} samples to prevent overfitting
- **Batch size 4**: Conservative approach for stability
- **Learning rate 1e-5**: Preserves base model capabilities
- **Warmup steps 100**: Gradual learning rate increase

### Training Monitoring

\`\`\`python
# Check training progress
job = client.fine_tuning.jobs.retrieve(fine_tune_job.id)
print(f"Status: {job.status}")
print(f"Progress: {job.training_progress}%")

# Get training events
events = client.fine_tuning.jobs.list_events(fine_tune_job.id)
for event in events.data[:5]:  # Show last 5 events
    print(f"{event.timestamp}: {event.message}")

# When training completes
if job.status == "succeeded":
    model_id = job.fine_tuned_model
    print(f"✅ Fine-tuned model ready: {model_id}")
\`\`\`

### Cost Estimation

Anthropic fine-tuning costs (estimated):
- **Training**: ~$${(qaPairs.length * 0.01).toFixed(2)} for ${qaPairs.length} samples
- **Inference**: Standard Claude API rates apply
- **Storage**: Minimal cost for model storage

### Usage After Training

\`\`\`python
# Use your fine-tuned model
response = client.messages.create(
    model="your_fine_tuned_model_id",
    max_tokens=200,
    temperature=0.7,
    messages=[
        {
            "role": "user", 
            "content": "Your question here"
        }
    ]
)

print(response.content[0].text)
\`\`\`

### Advanced Usage Patterns

**Constitutional AI Integration:**
\`\`\`python
# Use with constitutional principles
system_prompt = """You are a helpful assistant trained on specific domain knowledge. 
Follow these principles:
1. Provide accurate information based on your training
2. Acknowledge uncertainty when appropriate
3. Avoid speculation beyond your knowledge base
"""

response = client.messages.create(
    model="your_fine_tuned_model_id",
    max_tokens=300,
    system=system_prompt,
    messages=[{"role": "user", "content": "Your question"}]
)
\`\`\`

### Quality Evaluation

\`\`\`python
# Evaluate model performance
evaluation_prompts = [
    "Explain the main concept in simple terms",
    "What are the practical applications?",
    "Compare this with alternative approaches"
]

results = []
for prompt in evaluation_prompts:
    response = client.messages.create(
        model="your_fine_tuned_model_id",
        max_tokens=150,
        temperature=0.3,  # Lower for consistency
        messages=[{"role": "user", "content": prompt}]
    )
    
    results.append({
        "prompt": prompt,
        "response": response.content[0].text,
        "tokens": response.usage.output_tokens
    })

# Analyze results
for result in results:
    print(f"Q: {result['prompt']}")
    print(f"A: {result['response']}")
    print(f"Tokens: {result['tokens']}\\n")
\`\`\`

### Expected Results
- **Training time**: 30-60 minutes
- **Accuracy**: 90%+ on domain-specific questions
- **Response quality**: Significantly improved relevance
- **Consistency**: Better adherence to domain knowledge
- **Safety**: Maintained Claude's safety features

### Best Practices

1. **Data Quality**: Ensure high-quality prompt-completion pairs
2. **Balanced Training**: The ${incorrectCount} incorrect examples help with calibration
3. **Regular Evaluation**: Test on held-out examples
4. **Version Control**: Track model performance across versions
5. **Safety Testing**: Verify safety guardrails remain intact

### Troubleshooting

**Common Issues:**
- **Slow convergence**: Increase learning rate to 2e-5
- **Overfitting**: Reduce epochs to 2
- **Poor quality**: Check data formatting and consistency
- **High cost**: Use smaller batch sizes or fewer epochs

**Performance Optimization:**
\`\`\`python
# Optimize inference speed
response = client.messages.create(
    model="your_fine_tuned_model_id",
    max_tokens=100,  # Limit output length
    temperature=0.1,  # More deterministic
    top_p=0.9,       # Focus on high-probability tokens
    messages=[{"role": "user", "content": prompt}]
)
\`\`\`

### Integration Tips
- Use with existing Claude workflows
- Combine with RAG for enhanced knowledge
- Implement caching for repeated queries
- Monitor usage and costs regularly
`;
  }

  private static generateGenericGuide(qaPairs: QAPair[], correctCount: number, incorrectCount: number): string {
    return `## Generic Fine-Tuning Guide

### Dataset Overview
- Total samples: ${qaPairs.length}
- Correct answers: ${correctCount} (${((correctCount / qaPairs.length) * 100).toFixed(1)}%)
- Incorrect answers: ${incorrectCount} (${((incorrectCount / qaPairs.length) * 100).toFixed(1)}%)

### General Fine-Tuning Principles

Your dataset is designed for optimal fine-tuning across multiple platforms. Here are universal best practices:

### Dataset Characteristics

**Strengths of Your Dataset:**
1. **Balanced Examples**: ${correctCount} correct and ${incorrectCount} incorrect answers
2. **Quality Control**: Each answer includes confidence scores
3. **Diverse Questions**: Covers multiple aspects of your content
4. **Proper Labeling**: Clear correct/incorrect classification

### Universal Training Parameters

**Recommended Starting Points:**
\`\`\`yaml
epochs: 3-5
batch_size: 4-8
learning_rate: 1e-5 to 2e-5
warmup_steps: 10% of total steps
weight_decay: 0.01
gradient_clipping: 1.0
\`\`\`

### Platform-Agnostic Setup

**1. Data Validation**
\`\`\`python
import json
import pandas as pd

# Load and validate your dataset
with open('your_dataset.json', 'r') as f:
    data = json.load(f)

# Basic validation
print(f"Total samples: {len(data)}")
print(f"Required fields present: {all(key in data[0] for key in ['user', 'model', 'isCorrect'])}")

# Check for data quality issues
df = pd.DataFrame(data)
print(f"Empty questions: {df['user'].str.strip().eq('').sum()}")
print(f"Empty answers: {df['model'].str.strip().eq('').sum()}")
print(f"Average question length: {df['user'].str.len().mean():.1f} chars")
print(f"Average answer length: {df['model'].str.len().mean():.1f} chars")
\`\`\`

**2. Train/Validation Split**
\`\`\`python
from sklearn.model_selection import train_test_split

# Stratified split to maintain correct/incorrect ratio
train_data, val_data = train_test_split(
    data, 
    test_size=0.2, 
    random_state=42,
    stratify=[item['isCorrect'] for item in data]
)

print(f"Training samples: {len(train_data)}")
print(f"Validation samples: {len(val_data)}")
\`\`\`

### Training Strategies

**Progressive Training Approach:**
1. **Phase 1**: Train on correct examples only (epochs 1-2)
2. **Phase 2**: Include incorrect examples for discrimination (epoch 3)
3. **Phase 3**: Fine-tune with full dataset (epochs 4-5)

**Loss Function Considerations:**
- Use weighted loss to balance correct/incorrect examples
- Consider focal loss for hard example mining
- Monitor both accuracy and calibration metrics

### Evaluation Metrics

**Essential Metrics to Track:**
\`\`\`python
# Accuracy metrics
accuracy = correct_predictions / total_predictions
precision = true_positives / (true_positives + false_positives)
recall = true_positives / (true_positives + false_negatives)
f1_score = 2 * (precision * recall) / (precision + recall)

# Calibration metrics
confidence_accuracy_correlation = correlation(confidence_scores, correctness)
expected_calibration_error = mean(|confidence - accuracy|)
\`\`\`

### Expected Performance

**Baseline Expectations:**
- **Accuracy**: 85-95% on validation set
- **Precision**: 0.80-0.90 for both correct/incorrect classes
- **Recall**: 0.85-0.95 for correct answers
- **F1 Score**: 0.82-0.92 overall

**Training Time Estimates:**
- **Small models** (< 1B params): 30-60 minutes
- **Medium models** (1-7B params): 1-3 hours
- **Large models** (7B+ params): 3-8 hours

### Common Pitfalls and Solutions

**1. Overfitting**
- **Symptoms**: High training accuracy, low validation accuracy
- **Solutions**: Reduce epochs, increase dropout, add regularization

**2. Underfitting**
- **Symptoms**: Low accuracy on both training and validation
- **Solutions**: Increase learning rate, add more epochs, check data quality

**3. Class Imbalance Issues**
- **Symptoms**: Model always predicts majority class
- **Solutions**: Use weighted loss, oversample minority class, adjust thresholds

**4. Poor Calibration**
- **Symptoms**: Confidence scores don't match accuracy
- **Solutions**: Temperature scaling, Platt scaling, isotonic regression

### Model Selection Guidelines

**For Classification Tasks:**
- BERT/RoBERTa: Text classification and understanding
- DistilBERT: Faster inference, slightly lower accuracy
- ELECTRA: Good balance of speed and performance

**For Generation Tasks:**
- T5: Text-to-text generation
- GPT-2/GPT-3: Autoregressive generation
- BART: Sequence-to-sequence tasks

### Deployment Considerations

**Model Optimization:**
\`\`\`python
# Quantization for faster inference
from transformers import AutoModelForSequenceClassification
import torch

model = AutoModelForSequenceClassification.from_pretrained('your_model')
quantized_model = torch.quantization.quantize_dynamic(
    model, {torch.nn.Linear}, dtype=torch.qint8
)
\`\`\`

**Inference Optimization:**
- Batch predictions when possible
- Use appropriate hardware (GPU/CPU)
- Implement caching for repeated queries
- Monitor latency and throughput

### Quality Assurance

**Testing Checklist:**
- [ ] Model performs well on held-out test set
- [ ] Confidence scores are well-calibrated
- [ ] No significant bias in predictions
- [ ] Robust to input variations
- [ ] Maintains performance over time

**Continuous Monitoring:**
- Track prediction accuracy over time
- Monitor for data drift
- Collect user feedback
- Regular model retraining schedule

### Next Steps

1. **Choose your platform** and follow specific implementation guide
2. **Start with recommended parameters** and adjust based on results
3. **Monitor training closely** and stop early if overfitting
4. **Evaluate thoroughly** before deployment
5. **Plan for maintenance** and regular updates

Your dataset of ${qaPairs.length} samples with ${correctCount} correct and ${incorrectCount} incorrect examples is well-suited for fine-tuning. The inclusion of incorrect examples will help your model learn to distinguish between good and bad answers, reducing hallucination and improving overall reliability.
`;
  }

  public static downloadGuide(
    method: FineTuningMethod,
    qaPairs: QAPair[],
    sourceCount: number,
    themes: string[]
  ): void {
    const guide = this.generateFineTuningGuide(method, qaPairs, sourceCount, themes);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `fine_format_${method}_guide_${timestamp}.txt`;
    
    const blob = new Blob([guide], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}