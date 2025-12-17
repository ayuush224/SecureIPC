#include<bits/stdc++.h>
#include<iostream>
using namespace std;

class MinMaxHeap{
private:
    vector<int> nums;
public:
    MinMaxHeap(){};

    void modifyMin(int num){
        if(nums.empty())return;
        
        num += nums[0];
        popMin();

        push(num);
    }

    void push(int value){
        nums.push_back(value);
        trickleUp(nums.size()-1);
    }

    int getMin(){
        if(isEmpty())return -1;
        return nums[0];
    }

    int getMax(){
        if(nums.empty())return -1;
        if(nums.size() == 1)return nums[0];
        if(nums.size() == 2)return nums[1];

        return max(nums[1], nums[2]);
    }

    void popMin(){
        if(isEmpty())return;

        nums[0] = nums[nums.size()-1];
        nums.pop_back();

        trickleDown(0);
    }

    void popMax(){
        if(isEmpty())return;

        if(nums.size() == 1){
            nums.pop_back();
            return;
        }
        if(nums.size() == 2){
            nums.pop_back();
            return;
        }

        int largest = 1;
        if(nums[largest] < nums[2]){
            largest = 2;
        }
        nums[largest] = nums[nums.size()-1];
        nums.pop_back();
        
        trickleDown(largest);
    }

    bool isEmpty(){
        return nums.empty();
    }

    void trickleDown(int ind){
        if(ind >= nums.size())return;
        int level = log2(ind + 1);

        int leftChildInd = ind * 2 + 1;
        int rightChildInd = ind * 2 + 2;

        if(level & 1){
            int largest = ind;
            if(leftChildInd < nums.size() && nums[leftChildInd] > nums[largest]){
                largest = leftChildInd;
            }
            if(rightChildInd < nums.size() && nums[rightChildInd] > nums[largest]){
                largest = rightChildInd;
            }

            if(largest != ind){
                swap(nums[largest], nums[ind]);
                trickleDown(largest);
            }
        }
        else{
            int smallest = ind;
            if(leftChildInd < nums.size() && nums[leftChildInd] < nums[smallest]){
                smallest = leftChildInd;
            }
            if(leftChildInd < nums.size() && nums[rightChildInd] < nums[smallest]){
                smallest = rightChildInd;
            }

            if(smallest != ind){
                swap(nums[smallest], nums[ind]);
                trickleDown(smallest);
            }
        }

        int firstLeft = leftChildInd * 2 + 1;
        int secondLeft = rightChildInd * 2 + 1;

        int firstRight = leftChildInd * 2 + 2;
        int secondRight = rightChildInd * 2 + 2;

        if(level & 1){
            int largest = ind;
            if(firstLeft < nums.size() && nums[largest] < nums[firstLeft]){
                largest = firstLeft;
            }
            if(secondLeft < nums.size() && nums[largest] < nums[secondLeft]){
                largest = secondLeft;
            }
            if(firstRight < nums.size() && nums[largest] < nums[firstRight]){
                largest = firstRight;
            }
            if(secondRight < nums.size() && nums[largest] < nums[secondRight]){
                largest = secondRight;
            }

            if(largest != ind){
                swap(nums[largest], nums[ind]);
                trickleDown(largest);
            }
        }
        else{
            int smallest = ind;
            if(firstLeft < nums.size() && nums[smallest] > nums[firstLeft]){
                smallest = firstLeft;
            }
            if(secondLeft < nums.size() && nums[smallest] > nums[secondLeft]){
                smallest = secondLeft;
            }
            if(firstRight < nums.size() && nums[smallest] > nums[firstRight]){
                smallest = firstRight;
            }
            if(secondRight < nums.size() && nums[smallest] > nums[secondRight]){
                smallest = secondRight;
            }

            if(smallest != ind){
                swap(nums[smallest], nums[ind]);
                trickleDown(smallest);
            }
        }
    }

    void trickleUp(int ind){
        if(ind <= 0)return;
        int level = log2(ind + 1);

        int parentInd = ind / 2;
        if(ind % 2 == 0)parentInd -= 1;

        if(level & 1){
            if(parentInd >= 0 && nums[ind] < nums[parentInd]){
                swap(nums[parentInd], nums[ind]);
                trickleUp(parentInd);
            }
        }
        else{
            if(parentInd >= 0 && nums[ind] > nums[parentInd]){
                swap(nums[parentInd], nums[ind]);
                trickleUp(parentInd);
            }
        }

        int pparentInd = parentInd / 2;
        if(parentInd % 2 == 0)pparentInd -= 1;

        if(level & 1){
            if(pparentInd >= 0 && nums[ind] > nums[pparentInd]){
                swap(nums[pparentInd], nums[ind]);
                trickleUp(parentInd);
            }
        }
        else{
            if(pparentInd >= 0 && nums[ind] < nums[pparentInd]){
                swap(nums[pparentInd], nums[ind]);
                trickleUp(parentInd);
            }
        }
    }
};

class SharedMemory{
private:
    int readCount, writeCount, eraseCount;
    int semaphore, bufferSize;
    int agingFactor;

    MinMaxHeap readHeap;
    MinMaxHeap writeHeap;
    MinMaxHeap eraseHeap;
    vector<MinMaxHeap> messages;

public:
    SharedMemory(){
        readCount = writeCount = eraseCount = 0;
        semaphore = bufferSize = 0;
        this->agingFactor = 5;
        messages.push_back(readHeap);
        messages.push_back(writeHeap);
        messages.push_back(eraseHeap);
    }

    SharedMemory(int size, int agingFactor = 5){
        readCount = writeCount = eraseCount = 0;
        semaphore = bufferSize = size;
        this->agingFactor = agingFactor;
        messages.push_back(readHeap);
        messages.push_back(writeHeap);
        messages.push_back(eraseHeap);
    }

    void modifyMinOfAllQueue(){
        if(!readHeap.isEmpty()){
            readHeap.modifyMin(agingFactor);
        }
        if(!writeHeap.isEmpty()){
            writeHeap.modifyMin(agingFactor);
        }
        if(!eraseHeap.isEmpty()){
            eraseHeap.modifyMin(agingFactor);
        }
    }

    bool isValidToRead(){
        if(readHeap.isEmpty())return false;
        int currentMax = readHeap.getMax();

        if((writeHeap.isEmpty()) || (!writeHeap.isEmpty() && currentMax >= writeHeap.getMax())){
            if((eraseHeap.isEmpty()) || (!eraseHeap.isEmpty() && currentMax >= eraseHeap.getMax())){
                return true;
            }
        }

        return false;
    }

    bool isValidToWrite(){
        if(!writeHeap.isEmpty()){
            int currentMax = writeHeap.getMax();

            if((readHeap.isEmpty()) || (!readHeap.isEmpty() && currentMax >= readHeap.getMax())){
                if((eraseHeap.isEmpty()) || (!eraseHeap.isEmpty() && currentMax >= eraseHeap.getMax())){
                    return true;
                }
            }
        }

        return false;
    }

    bool isValidToErase(){
        if(!eraseHeap.isEmpty()){
            int currentMax = eraseHeap.getMax();
                
            if((readHeap.isEmpty()) || (!readHeap.isEmpty() && currentMax >= readHeap.getMax())){
    
                if((writeHeap.isEmpty()) || (!writeHeap.isEmpty() && currentMax >= writeHeap.getMax())){
                    return true;
                }
            }
        }

        return false;
    }

    void read(int priority){
        readHeap.push(priority);
        if(semaphore <= 0)return;
        if(semaphore > bufferSize)return;

        if(isValidToRead() && !writeCount && !eraseCount){
            readCount += 1;
            semaphore -= 1;
            //Maximum Priority Value got the chance to read
            readHeap.popMax();

            if(!readHeap.isEmpty()){
                //Modify the minimum with the agingFactor provided
                modifyMinOfAllQueue();

            }

            if(isValidToRead()){
                int nextMax = readHeap.getMax();
                readHeap.popMax();
                
                read(nextMax);
            }
        }
    }

    void write(int priority){
        writeHeap.push(priority);
        if(semaphore <= 0)return;

        if(isValidToWrite() && !readCount && !writeCount && !eraseCount){
            writeHeap.popMax();
            writeCount += 1;
            semaphore -= 1;
            
            //Modify the minimum with the agingFactor Provided
            if(!writeHeap.isEmpty()){
                modifyMinOfAllQueue();
            }
        }
    }

    void erase(int priority){
        eraseHeap.push(priority);
        if(semaphore <= 0)return;

        if(isValidToErase() && !readCount && !writeCount && !eraseCount){
            eraseHeap.popMax();
            eraseCount += 1;
            semaphore -= 1;

            //Modify the minimum with the agingFactor Provided
            if(!eraseHeap.isEmpty()){
                modifyMinOfAllQueue();
            }
        }
    }

    void signalRead(){
        readCount -= 1;
        semaphore += 1;

        signalAll();
    }

    void signalWrite(){
        writeCount -= 1;
        semaphore += 1;
        
        signalAll();
    }

    void signalErase(){
        eraseCount -= 1;
        semaphore += 1;

        signalAll();
    }


    void signalAll(){
        if(isValidToRead()){
            int re = readHeap.getMax();
            readHeap.popMax();
            read(re);      
        }
        else if(isValidToWrite()){
            int wr = writeHeap.getMax();
            writeHeap.popMax();
            write(wr);
        }
        else if(isValidToErase()){
            int er = eraseHeap.getMax();
            eraseHeap.popMax();
            erase(er);
        }
    }
};


int main(){

}